precision highp float;
precision highp sampler3D;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "core/raySphereIntersection"
#include "atmosphere/parameters"
#include "atmosphere/functions"
#include "parameters"
#include "clouds"

uniform sampler2D depthBuffer;
uniform vec3 cameraPosition;
uniform float cameraNear;
uniform float cameraFar;
uniform float cameraHeight;
uniform sampler3D blueNoiseTexture;

// Scattering parameters
uniform vec3 albedo;
uniform float scatterAnisotropy1;
uniform float scatterAnisotropy2;
uniform float scatterAnisotropyMix;
uniform float skyIrradianceScale;
uniform float powderScale;
uniform float powderExponent;

// Raymarch to clouds
uniform int maxIterations;
uniform float initialStepSize;
uniform float maxStepSize;
uniform float maxRayDistance;
uniform float minDensity;
uniform float minTransmittance;

// Beer shadow map
uniform sampler2D shadowBuffer;
uniform mat4 shadowMatrix;

in vec2 vUv;
in vec3 vViewDirection; // Direction to the center of screen
in vec3 vRayDirection; // Direction to the texel

layout(location = 0) out vec4 outputColor;

float blueNoise(const vec2 uv) {
  return texture(
    blueNoiseTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).x;
}

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture(depthBuffer, uv));
  #else
  return texture(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif
}

vec3 getShadow(vec3 position) {
  vec4 point = shadowMatrix * vec4(position + ellipsoidCenter, 1.0);
  point /= point.w;
  vec2 uv = point.xy * 0.5 + 0.5;
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    // x: frontDepth, y: meanExtinction, z: maxOpticalDepth
    return texture(shadowBuffer, uv).xyz;
  }
  return vec3(0.0);
}

vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {
  vec2 g2 = g * g;
  const float reciprocalPi4 = 0.07957747154594767;
  return reciprocalPi4 * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5)));
}

float phaseFunction(const float cosTheta, const float attenuation) {
  vec2 g = vec2(scatterAnisotropy1, scatterAnisotropy2);
  vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}

float sampleOpticalDepth(const vec3 rayOrigin, const vec3 rayDirection, const float mipLevel) {
  const float stepSize = 20.0;
  float opticalDepth = 0.0;
  float stepScale = 1.0;
  float prevStepScale = 0.0;
  for (int i = 0; i < MAX_SECONDARY_ITERATIONS; ++i) {
    vec3 position = rayOrigin + rayDirection * stepScale * stepSize;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    float density = sampleDensityDetail(weather, position, mipLevel);
    opticalDepth += density * (stepScale - prevStepScale) * stepSize;
    prevStepScale = stepScale;
    stepScale *= 2.0;
  }
  return opticalDepth;
}

float multipleScattering(const float opticalDepth, const float cosTheta) {
  // Multiple scattering approximation
  // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  // Attenuation (a), contribution (b) and phase attenuation (c).
  vec3 abc = vec3(1.0);
  const vec3 attenuation = vec3(0.5, 0.5, 0.8); // Should satisfy a <= b
  float scattering = 0.0;
  for (int octave = 0; octave < MULTI_SCATTERING_OCTAVES; ++octave) {
    float beerLambert = exp(-opticalDepth * abc.y);
    // A similar approximation is described in the Frostbite's paper, where
    // phase angle is attenuated.
    scattering += abc.x * beerLambert * phaseFunction(cosTheta, abc.z);
    abc *= attenuation;
  }
  return scattering;
}

vec4 marchToClouds(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float jitter,
  const float maxRayDistance,
  const float rayStartTexelsPerPixel,
  const vec3 sunDirection,
  vec3 sunIrradiance,
  vec3 skyIrradiance,
  out float weightedMeanDepth
) {
  vec3 radianceIntegral = vec3(0.0);
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  float stepSize = initialStepSize;
  float rayDistance = stepSize * jitter;
  float cosTheta = dot(sunDirection, rayDirection);

  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayOrigin + rayDirection * rayDistance;

    // Sample a rough density.
    float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance / 1e5));
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample a detailed density.
      float density = sampleDensityDetail(weather, position, mipLevel);
      if (density > minDensity) {
        // density *= 0.1;
        #ifdef ACCURATE_ATMOSPHERIC_IRRADIANCE
        sunIrradiance = GetSunAndSkyIrradiance(
          position * METER_TO_UNIT_LENGTH,
          sunDirection,
          skyIrradiance
        );
        #endif // ACCURATE_ATMOSPHERIC_IRRADIANCE

        // Distance to the top of the bottom layer along the sun direction.
        // This matches the ray origin of BSM.
        float distanceToTop = raySphereSecondIntersection(
          position + ellipsoidCenter,
          sunDirection,
          ellipsoidCenter,
          bottomRadius + maxLayerHeights.x
        );

        // Obtain the optical depth at the position from BSM.
        vec3 shadow = getShadow(position);
        float frontDepth = shadow.x;
        float meanExtinction = shadow.y;
        float maxOpticalDepth = shadow.z;
        float shadowOpticalDepth = min(
          maxOpticalDepth,
          meanExtinction * max(0.0, distanceToTop - frontDepth)
        );

        float sunOpticalDepth = 0.0;
        if (mipLevel < 0.5) {
          sunOpticalDepth = sampleOpticalDepth(position, sunDirection, mipLevel);
        }
        float opticalDepth = sunOpticalDepth + shadowOpticalDepth;
        float scattering = multipleScattering(opticalDepth, cosTheta);
        vec3 radiance = (sunIrradiance * scattering + skyIrradiance * skyIrradianceScale) * density;

        // Fudge factor for the irradiance from ground.
        if (mipLevel < 0.5) {
          float groundOpticalDepth = sampleOpticalDepth(position, -normalize(position), mipLevel);
          radiance += radiance * exp(-groundOpticalDepth - (height - minHeight) * 0.01);
        }

        #ifdef USE_POWDER
        radiance *= 1.0 - powderScale * exp(-density * powderExponent);
        #endif // USE_POWDER

        // Energy-conserving analytical integration of scattered light
        // See 5.6.3 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
        float transmittance = exp(-density * stepSize);
        float clampedDensity = max(density, 1e-7);
        vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedDensity;
        radianceIntegral += transmittanceIntegral * scatteringIntegral;
        transmittanceIntegral *= transmittance;

        // Aerial perspective affecting clouds
        // See 5.9.1 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
        weightedDistanceSum += rayDistance * transmittanceIntegral;
        transmittanceSum += transmittanceIntegral;
      }

      // Take a shorter step because we've already hit the clouds.
      stepSize *= 1.005;
      rayDistance += stepSize;
    } else {
      // Otherwise step longer in empty space.
      // TODO: This produces some banding artifacts.
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
    }

    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }
  }

  // The final product of 5.9.1 and we'll evaluate this in aerial perspective.
  weightedMeanDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : 0.0;

  return vec4(
    radianceIntegral,
    saturate(remap(transmittanceIntegral, minTransmittance, 1.0, 1.0, 0.0))
  );
}

void applyAerialPerspective(const vec3 camera, const vec3 point, inout vec4 color) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    camera * METER_TO_UNIT_LENGTH,
    point * METER_TO_UNIT_LENGTH,
    0.0, // Shadow length
    sunDirection,
    transmittance
  );
  color.rgb = mix(color.rgb, color.rgb * transmittance + inscatter, color.a);
}

void getRayNearFar(const vec3 rayDirection, out float rayNear, out float rayFar) {
  bool intersectsGround =
    raySphereFirstIntersection(cameraPosition, rayDirection, ellipsoidCenter, bottomRadius) >= 0.0;

  if (cameraHeight < minHeight) {
    if (intersectsGround) {
      rayNear = -1.0;
      return;
    }
    rayNear = raySphereSecondIntersection(
      cameraPosition,
      rayDirection,
      ellipsoidCenter,
      bottomRadius + minHeight
    );
    rayFar = raySphereSecondIntersection(
      cameraPosition,
      rayDirection,
      ellipsoidCenter,
      bottomRadius + maxHeight
    );
    rayFar = min(rayFar, maxRayDistance);
  } else if (cameraHeight < maxHeight) {
    rayNear = 0.0;
    if (intersectsGround) {
      rayFar = raySphereFirstIntersection(
        cameraPosition,
        rayDirection,
        ellipsoidCenter,
        bottomRadius + minHeight
      );
    } else {
      rayFar = raySphereSecondIntersection(
        cameraPosition,
        rayDirection,
        ellipsoidCenter,
        bottomRadius + maxHeight
      );
    }
  } else {
    float intersection1;
    float intersection2;
    raySphereIntersections(
      cameraPosition,
      rayDirection,
      ellipsoidCenter,
      bottomRadius + maxHeight,
      intersection1,
      intersection2
    );
    rayNear = intersection1;
    if (intersectsGround) {
      rayFar = raySphereFirstIntersection(
        cameraPosition,
        rayDirection,
        ellipsoidCenter,
        bottomRadius + minHeight
      );
    } else {
      rayFar = intersection2;
    }
  }
}

void main() {
  vec3 rayDirection = normalize(vRayDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(rayDirection, rayNear, rayFar);
  if (rayNear < 0.0) {
    discard;
  }

  // Clamp the ray at the scene objects.
  float depth = readDepth(vUv);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    float viewZ = getViewZ(depth);
    float rayDistance = -viewZ / dot(rayDirection, vViewDirection);
    rayFar = min(rayFar, rayDistance);
  }

  vec3 viewPosition = cameraPosition - ellipsoidCenter;
  vec3 rayOrigin = viewPosition + rayNear * rayDirection;

  vec2 globeUv = getGlobeUv(rayOrigin);
  float mipLevel = getMipLevel(globeUv * localWeatherFrequency);
  mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));

  vec3 skyIrradiance;
  vec3 sunIrradiance;
  #ifndef ACCURATE_ATMOSPHERIC_IRRADIANCE
  // Sample the irradiance at the near point for a rough estimate.
  sunIrradiance = GetSunAndSkyIrradiance(
    rayOrigin * METER_TO_UNIT_LENGTH,
    sunDirection,
    skyIrradiance
  );
  #endif // ACCURATE_ATMOSPHERIC_IRRADIANCE

  float jitter = blueNoise(vUv);
  float weightedMeanDepth;
  vec4 color = marchToClouds(
    rayOrigin,
    rayDirection,
    jitter,
    rayFar - rayNear,
    pow(2.0, mipLevel),
    sunDirection,
    sunIrradiance,
    skyIrradiance,
    weightedMeanDepth
  );

  if (weightedMeanDepth > 0.0) {
    weightedMeanDepth += rayNear;
    vec3 frontPosition = viewPosition + weightedMeanDepth * rayDirection;
    applyAerialPerspective(viewPosition, frontPosition, color);
  }

  outputColor = color;
}
