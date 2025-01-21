precision highp float;
precision highp sampler3D;
precision highp sampler2DArray;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "core/generators"
#include "core/raySphereIntersection"
#include "atmosphere/parameters"
#include "atmosphere/functions"
#include "parameters"
#include "clouds"

uniform sampler2D depthBuffer;
uniform mat4 viewMatrix;
uniform mat4 reprojectionMatrix;
uniform float cameraNear;
uniform float cameraFar;
uniform float cameraHeight;
uniform vec2 temporalJitter;
uniform sampler3D stbnTexture;

// Scattering parameters
uniform vec3 albedo;
uniform float scatterAnisotropy1;
uniform float scatterAnisotropy2;
uniform float scatterAnisotropyMix;
uniform float skyIrradianceScale;
uniform float groundIrradianceScale;
uniform float powderScale;
uniform float powderExponent;

// Primary raymarch
uniform int maxIterations;
uniform float minStepSize;
uniform float maxStepSize;
uniform float maxRayDistance;
uniform float minDensity;
uniform float minTransmittance;

// Secondary raymarch
uniform int maxSunIterations;
uniform int maxGroundIterations;
uniform float secondaryStepSize;
uniform float secondaryStepScale;

// Beer shadow map
uniform sampler2DArray shadowBuffer;
uniform vec2 shadowTexelSize;
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];
uniform float shadowFar;
uniform float shadowFilterRadius;
uniform float maxShadowOpticalDepthScale;

// Shadow length
#ifdef SHADOW_LENGTH
uniform int maxShadowLengthIterations;
uniform float minShadowLengthStepSize;
uniform float maxShadowLengthRayDistance;
#endif // SHADOW_LENGTH

in vec2 vUv;
in vec3 vCameraPosition;
in vec3 vCameraDirection; // Direction to the center of screen
in vec3 vRayDirection; // Direction to the texel
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;
layout(location = 1) out vec3 outputDepthVelocity;
#ifdef SHADOW_LENGTH
layout(location = 2) out float outputShadowLength;
#endif // SHADOW_LENGTH

vec3 getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  // xy: vec2, z: scalar
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).xyz;
}

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture(depthBuffer, uv));
  #else // DEPTH_PACKING == 3201
  return texture(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif // PERSPECTIVE_CAMERA
}

int getCascadeIndex(const vec3 position) {
  vec4 viewPosition = viewMatrix * vec4(position, 1.0);
  float depth = viewZToOrthographicDepth(viewPosition.z, cameraNear, shadowFar);
  for (int i = 0; i < SHADOW_CASCADE_COUNT; ++i) {
    vec2 interval = shadowIntervals[i];
    if (depth >= interval.x && depth < interval.y) {
      return i;
    }
  }
  return SHADOW_CASCADE_COUNT - 1;
}

#ifdef DEBUG_SHOW_CASCADES
vec3 getCascadeColor(const vec3 rayPosition) {
  const vec3 colors[4] = vec3[4](
    vec3(1.0, 0.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 0.0, 1.0),
    vec3(1.0, 1.0, 0.0)
  );
  // Ray position is relative to the ellipsoid.
  vec3 worldPosition = mat3(ellipsoidMatrix) * (rayPosition + vEllipsoidCenter);
  int index = getCascadeIndex(worldPosition);
  vec4 point = shadowMatrices[index] * vec4(worldPosition, 1.0);
  point /= point.w;
  vec2 uv = point.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(1.0);
  }
  return colors[index];
}
#endif // DEBUG_SHOW_CASCADES

vec3 sampleShadow(const vec3 rayPosition, vec2 offset) {
  // Ray position is relative to the ellipsoid.
  vec3 worldPosition = mat3(ellipsoidMatrix) * (rayPosition + vEllipsoidCenter);
  int index = getCascadeIndex(worldPosition);
  vec4 point = shadowMatrices[index] * vec4(worldPosition, 1.0);
  point /= point.w;
  vec2 uv = point.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(0.0);
  }
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth
  return texture(shadowBuffer, vec3(uv + offset, float(index))).rgb;
}

float sampleShadowOpticalDepth(
  const vec3 rayPosition,
  const float distanceToTop,
  const float maxOpticalDepthScale,
  const vec2 offset
) {
  vec3 shadow = sampleShadow(rayPosition, offset);
  // In Hillaire's presentation, optical depth is clamped to the max optical
  // depth. While it is understandable, it lacks resolution in shadows
  // compared to marched results with a very high number of iterations.
  // https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf
  return min(shadow.b * maxOpticalDepthScale, shadow.g * max(0.0, distanceToTop - shadow.r));
}

float sampleShadowOpticalDepth(
  const vec3 rayPosition,
  const float distanceToTop,
  const vec2 offset
) {
  return sampleShadowOpticalDepth(rayPosition, distanceToTop, 1.0, offset);
}

vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {
  vec2 g2 = g * g;
  const float reciprocalPi4 = 0.07957747154594767;
  vec2 denom = max(vec2(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5)));
  return reciprocalPi4 * ((1.0 - g2) / denom);
}

float phaseFunction(const float cosTheta, const float attenuation) {
  vec2 g = vec2(scatterAnisotropy1, scatterAnisotropy2);
  vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);
  // A similar approximation is described in the Frostbite's paper, where phase
  // angle is attenuated instead of anisotropy.
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}

float marchOpticalDepth(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const int maxIterations,
  const float mipLevel
) {
  if (mipLevel > 0.75) {
    return 0.5; // Fudge factor to approximate the average optical depth.
  }
  int iterations = int(remap(mipLevel, 0.0, 0.75, float(maxIterations), 1.0));
  float stepSize = secondaryStepSize / float(iterations);
  float opticalDepth = 0.0;
  float stepScale = 1.0;
  float prevStepScale = 0.0;
  for (int i = 0; i < iterations; ++i) {
    vec3 position = stepSize * stepScale * rayDirection + rayOrigin;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    float density = sampleShape(weather, position, mipLevel);
    opticalDepth += density * (stepScale - prevStepScale) * stepSize;
    prevStepScale = stepScale;
    stepScale *= secondaryStepScale;
  }
  return opticalDepth;
}

vec3 multipleScattering(const float opticalDepth, const float cosTheta) {
  // Multiple scattering approximation
  // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  // x: attenuation, y: contribution, z: phase attenuation
  vec3 coeffs = vec3(1.0);
  const vec3 attenuation = vec3(0.5, 0.5, 0.8); // Should satisfy a <= b
  vec3 scattering = vec3(0.0);
  float beerLambert;
  #pragma unroll_loop_start
  for (int i = 0; i < 12; ++i) {
    #if UNROLLED_LOOP_INDEX < MULTI_SCATTERING_OCTAVES
    beerLambert = exp(-opticalDepth * coeffs.y);
    scattering += albedo * coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);
    coeffs *= attenuation;
    #endif // UNROLLED_LOOP_INDEX < MULTI_SCATTERING_OCTAVES
  }
  #pragma unroll_loop_end
  return scattering;
}

vec4 marchClouds(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float maxRayDistance,
  const float jitter,
  const vec2 jitterVec2,
  const float rayStartTexelsPerPixel,
  const vec3 sunDirection,
  out float frontDepth
) {
  vec3 radianceIntegral = vec3(0.0);
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;
  vec3 sunIrradiance;
  vec3 skyIrradiance;

  float stepSize = minStepSize;
  float rayDistance = stepSize * jitter;
  float cosTheta = dot(sunDirection, rayDirection);

  // TODO: Use jitter only when the zenith angle is very large.
  vec2 jitterUv = shadowFilterRadius * shadowTexelSize * jitterVec2;

  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;

    // Sample a rough density.
    float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (!any(greaterThan(weather.density, vec4(minDensity)))) {
      // Step longer in empty space.
      // TODO: This produces banding artifacts.
      // Possible improvement: Binary search refinement
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
      continue;
    }

    // Sample a detailed density.
    float density = sampleShape(weather, position, mipLevel);
    if (density > minDensity) {
      sunIrradiance = GetSunAndSkyIrradiance(
        position * METER_TO_LENGTH_UNIT,
        sunDirection,
        skyIrradiance
      );

      // Distance to the top of the shadows along the sun direction.
      // This matches the ray origin of BSM.
      float distanceToTop = raySphereSecondIntersection(
        position,
        sunDirection,
        vec3(0.0),
        bottomRadius + shadowTopHeight
      );

      // Obtain the optical depth at the position from BSM.
      float shadowOpticalDepth = 0.0;
      if (distanceToTop > 0.0) {
        shadowOpticalDepth = sampleShadowOpticalDepth(
          position,
          distanceToTop,
          maxShadowOpticalDepthScale,
          jitterUv
        );
      }

      float sunOpticalDepth = marchOpticalDepth(position, sunDirection, maxSunIterations, mipLevel);
      float opticalDepth = sunOpticalDepth + shadowOpticalDepth;
      vec3 albedoScattering = multipleScattering(opticalDepth, cosTheta);
      vec3 scatteredIrradiance = albedoScattering * (sunIrradiance + skyIrradiance);
      vec3 radiance = scatteredIrradiance + albedo * skyIrradiance * skyIrradianceScale;

      #ifdef GROUND_IRRADIANCE
      // Fudge factor for the irradiance from ground.
      if (mipLevel < 0.5) {
        float groundOpticalDepth = marchOpticalDepth(
          position,
          -normalize(position),
          maxGroundIterations,
          mipLevel
        );
        float heightScale = max(0.0, 1.0 - weather.heightFraction.x * 2.0);
        vec3 groundIrradiance = radiance * exp(-groundOpticalDepth) * heightScale;
        // Ground irradiance decreases as coverage increases.
        groundIrradiance *= 1.0 - coverage;
        radiance += albedo * groundIrradiance * groundIrradianceScale;
      }
      #endif // GROUND_IRRADIANCE

      radiance *= density;

      #ifdef POWDER
      radiance *= 1.0 - powderScale * exp(-density * powderExponent);
      #endif // POWDER

      #ifdef DEBUG_SHOW_CASCADES
      radiance = 1e-3 * getCascadeColor(position);
      #endif // DEBUG_SHOW_CASCADES

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

    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }

    // Take a shorter step because we've already hit the clouds.
    stepSize *= 1.005;
    rayDistance += stepSize;
  }

  // The final product of 5.9.1 and we'll evaluate this in aerial perspective.
  frontDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : -1.0;

  return vec4(
    radianceIntegral,
    saturate(remap(transmittanceIntegral, minTransmittance, 1.0, 1.0, 0.0))
  );
}

#ifdef SHADOW_LENGTH

float marchShadowLength(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float maxRayDistance,
  const float jitter
) {
  float shadowLength = 0.0;
  float stepSize = minShadowLengthStepSize;
  float rayDistance = 0.0;

  rayDistance -= stepSize * jitter;

  for (int i = 0; i < maxShadowLengthIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;

    // Distance to the top of the shadows along the sun direction.
    // This matches the ray origin of BSM.
    float distanceToTop = raySphereSecondIntersection(
      position,
      sunDirection,
      vec3(0.0),
      bottomRadius + shadowTopHeight
    );
    float opticalDepth = sampleShadowOpticalDepth(position, distanceToTop, vec2(0.0));
    // Hack to prevent over-integration of shadow length. The shadow should be
    // attenuated by the inscatter as the ray travels further.
    float attenuation = exp(-rayDistance * 1e-5);
    shadowLength += stepSize * (1.0 - exp(-opticalDepth)) * attenuation;
    if (attenuation < 1e-5) {
      break;
    }

    stepSize *= 1.005;
    rayDistance += stepSize;
  }
  // Scale to the length unit because we only use this in atmosphere functions.
  return shadowLength * METER_TO_LENGTH_UNIT;
}

#endif // SHADOW_LENGTH

void applyAerialPerspective(
  const vec3 cameraPosition,
  const vec3 frontPosition,
  const float shadowLength,
  inout vec4 color
) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    cameraPosition * METER_TO_LENGTH_UNIT,
    frontPosition * METER_TO_LENGTH_UNIT,
    shadowLength,
    sunDirection,
    transmittance
  );
  color.rgb = mix(color.rgb, color.rgb * transmittance + inscatter, color.a);
}

bool rayIntersectsGround(const vec3 cameraPosition, const vec3 rayDirection) {
  float r = length(cameraPosition);
  float mu = dot(cameraPosition, rayDirection) / r;
  return mu < 0.0 && r * r * (mu * mu - 1.0) + bottomRadius * bottomRadius >= 0.0;
}

void getRayNearFar(
  const vec3 cameraPosition,
  const vec3 rayDirection,
  out vec2 rayNearFar,
  out vec2 shadowLengthRayNearFar
) {
  bool intersectsGround = rayIntersectsGround(cameraPosition, rayDirection);

  if (cameraHeight < minHeight) {
    // View below the clouds
    if (intersectsGround) {
      rayNearFar = vec2(-1.0); // No clouds to the ground
    } else {
      rayNearFar = vec2(
        raySphereSecondIntersection(cameraPosition, rayDirection, bottomRadius + minHeight),
        raySphereSecondIntersection(cameraPosition, rayDirection, bottomRadius + maxHeight)
      );
      rayNearFar.y = min(rayNearFar.y, maxRayDistance);
    }
  } else if (cameraHeight < maxHeight) {
    // View inside the total cloud layer
    if (intersectsGround) {
      rayNearFar = vec2(
        cameraNear,
        raySphereSecondIntersection(cameraPosition, rayDirection, bottomRadius + minHeight)
      );
    } else {
      rayNearFar = vec2(
        cameraNear,
        raySphereSecondIntersection(cameraPosition, rayDirection, bottomRadius + maxHeight)
      );
    }
  } else {
    // View above the clouds
    raySphereIntersections(
      cameraPosition,
      rayDirection,
      bottomRadius + maxHeight,
      rayNearFar.x,
      rayNearFar.y
    );
    if (intersectsGround) {
      // Clamp the ray at the min height.
      rayNearFar.y = raySphereFirstIntersection(
        cameraPosition,
        rayDirection,
        bottomRadius + minHeight
      );
    }
  }

  #ifdef SHADOW_LENGTH
  if (cameraHeight < shadowTopHeight) {
    if (intersectsGround) {
      shadowLengthRayNearFar = vec2(
        cameraNear,
        raySphereFirstIntersection(cameraPosition, rayDirection, bottomRadius)
      );
    } else {
      shadowLengthRayNearFar = vec2(
        cameraNear,
        raySphereSecondIntersection(cameraPosition, rayDirection, bottomRadius + shadowTopHeight)
      );
    }
  } else {
    raySphereIntersections(
      cameraPosition,
      rayDirection,
      bottomRadius + shadowTopHeight,
      shadowLengthRayNearFar.x,
      shadowLengthRayNearFar.y
    );
    if (intersectsGround) {
      // Clamp the ray at the ground.
      shadowLengthRayNearFar.y = raySphereFirstIntersection(
        cameraPosition,
        rayDirection,
        bottomRadius
      );
    }
  }
  shadowLengthRayNearFar.y = min(shadowLengthRayNearFar.y, maxShadowLengthRayDistance);
  #endif // SHADOW_LENGTH
}

#ifdef DEBUG_SHOW_SHADOW_MAP
vec4 getCascadedShadowMaps(vec2 uv) {
  vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;
  vec4 shadow = vec4(0.0);
  if (uv.y > 0.5) {
    if (uv.x < 0.5) {
      shadow = texture(shadowBuffer, vec3(coord.xw, 0.0));
    } else {
      #if SHADOW_CASCADE_COUNT > 1
      shadow = texture(shadowBuffer, vec3(coord.zw, 1.0));
      #endif // SHADOW_CASCADE_COUNT > 1
    }
  } else {
    if (uv.x < 0.5) {
      #if SHADOW_CASCADE_COUNT > 2
      shadow = texture(shadowBuffer, vec3(coord.xy, 2.0));
      #endif // SHADOW_CASCADE_COUNT > 2
    } else {
      #if SHADOW_CASCADE_COUNT > 3
      shadow = texture(shadowBuffer, vec3(coord.zy, 3.0));
      #endif // SHADOW_CASCADE_COUNT > 3
    }
  }

  #ifndef DEBUG_SHOW_SHADOW_MAP_TYPE
  #define DEBUG_SHOW_SHADOW_MAP_TYPE (0)
  #endif // DEBUG_SHOW_SHADOW_MAP_TYPE

  const float frontDepthScale = 1e-5;
  const float meanExtinctionScale = 10.0;
  const float maxOpticalDepthScale = 0.01;
  vec3 color;
  #if DEBUG_SHOW_SHADOW_MAP_TYPE == 1
  color = vec3(shadow.r * frontDepthScale);
  #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 2
  color = vec3(shadow.g * meanExtinctionScale);
  #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 3
  color = vec3(shadow.b * maxOpticalDepthScale);
  #else // DEBUG_SHOW_SHADOW_MAP_TYPE
  color = shadow.rgb * vec3(frontDepthScale, meanExtinctionScale, maxOpticalDepthScale);
  #endif // DEBUG_SHOW_SHADOW_MAP_TYPE
  return vec4(color, 1.0);
}
#endif // DEBUG_SHOW_SHADOW_MAP

void clampRayAtSceneObjects(const vec3 rayDirection, inout vec2 nearFar) {
  float depth = readDepth(vUv + temporalJitter);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    float viewZ = getViewZ(depth);
    float rayDistance = -viewZ / dot(rayDirection, vCameraDirection);
    nearFar.y = min(nearFar.y, rayDistance);
  }
}

void clampRaysAtSceneObjects(const vec3 rayDirection, inout vec2 nearFar1, inout vec2 nearFar2) {
  float depth = readDepth(vUv + temporalJitter);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    float viewZ = getViewZ(depth);
    float rayDistance = -viewZ / dot(rayDirection, vCameraDirection);
    nearFar1.y = min(nearFar1.y, rayDistance);
    nearFar2.y = min(nearFar2.y, rayDistance);
  }
}

void main() {
  #ifdef SHADOW_LENGTH
  outputShadowLength = 0.0;
  #else // SHADOW_LENGTH
  float outputShadowLength = 0.0;
  #endif // SHADOW_LENGTH

  #ifdef DEBUG_SHOW_SHADOW_MAP
  outputColor = getCascadedShadowMaps(vUv);
  outputDepthVelocity = vec3(0.0);
  return;
  #endif // DEBUG_SHOW_SHADOW_MAP

  vec3 cameraPosition = vCameraPosition - vEllipsoidCenter;
  vec3 rayDirection = normalize(vRayDirection);
  vec2 rayNearFar;
  vec2 shadowLengthRayNearFar;
  getRayNearFar(cameraPosition, rayDirection, rayNearFar, shadowLengthRayNearFar);

  #ifdef SHADOW_LENGTH
  vec3 stbn = getSTBN();
  #endif // SHADOW_LENGTH

  if (any(lessThan(rayNearFar, vec2(0.0)))) {
    #ifdef SHADOW_LENGTH
    clampRayAtSceneObjects(rayDirection, shadowLengthRayNearFar);
    if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
      outputShadowLength = marchShadowLength(
        shadowLengthRayNearFar.x * rayDirection + cameraPosition,
        rayDirection,
        shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
        stbn.z
      );
    }
    #endif // SHADOW_LENGTH

    outputColor = vec4(0.0);
    outputDepthVelocity = vec3(0.0);
    return; // Intersects with the ground, or no intersections.
  }

  clampRaysAtSceneObjects(rayDirection, rayNearFar, shadowLengthRayNearFar);
  if (rayNearFar.y < rayNearFar.x) {
    #ifdef SHADOW_LENGTH
    if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
      outputShadowLength = marchShadowLength(
        shadowLengthRayNearFar.x * rayDirection + cameraPosition,
        rayDirection,
        shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
        stbn.z
      );
    }
    #endif // SHADOW_LENGTH

    // TODO: We can calculate velocity here, which reduces occlusion errors at
    // the edges, but suffers from floating-point precision errors on near
    // objects.
    // vec3 frontPosition = cameraPosition + rayNearFar.y * rayDirection;
    // vec3 frontPositionWorld = mat3(ellipsoidMatrix) * (frontPosition + vEllipsoidCenter);
    // vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);
    // prevClip /= prevClip.w;
    // vec2 prevUv = prevClip.xy * 0.5 + 0.5;
    // vec2 velocity = (vUv - prevUv) * resolution;
    // outputColor = vec4(0.0);
    // outputDepthVelocity = vec3(rayNearFar.y, velocity);
    outputColor = vec4(0.0);
    outputDepthVelocity = vec3(0.0);
    return; // Scene objects in front of the clouds layer boundary.
  }

  vec3 rayOrigin = rayNearFar.x * rayDirection + cameraPosition;

  vec2 globeUv = getGlobeUv(rayOrigin);
  #ifdef DEBUG_SHOW_UV
  outputColor = vec4(vec3(checker(globeUv, localWeatherFrequency)), 1.0);
  outputDepthVelocity = vec3(0.0);
  outputShadowLength = 0.0;
  return;
  #endif // DEBUG_SHOW_UV

  float mipLevel = getMipLevel(globeUv * localWeatherFrequency);
  mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));

  #ifndef SHADOW_LENGTH
  vec3 stbn = getSTBN();
  #endif // !defined(SHADOW_LENGTH)

  float frontDepth;
  vec4 color = marchClouds(
    rayOrigin,
    rayDirection,
    rayNearFar.y - rayNearFar.x,
    stbn.z,
    stbn.xy,
    pow(2.0, mipLevel),
    sunDirection,
    frontDepth
  );

  if (frontDepth > 0.0) {
    frontDepth = rayNearFar.x + frontDepth;
    // Clamp the shadow length ray at the clouds.
    shadowLengthRayNearFar.y = min(frontDepth, shadowLengthRayNearFar.y);
  } else {
    frontDepth = rayNearFar.y;
  }

  #ifdef SHADOW_LENGTH
  if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
    outputShadowLength = marchShadowLength(
      shadowLengthRayNearFar.x * rayDirection + cameraPosition,
      rayDirection,
      shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
      stbn.z
    );
  }
  #endif // SHADOW_LENGTH

  // Apply aerial perspective.
  vec3 frontPosition = cameraPosition + frontDepth * rayDirection;
  applyAerialPerspective(cameraPosition, frontPosition, outputShadowLength, color);

  // Velocity for temporal resolution.
  vec3 frontPositionWorld = mat3(ellipsoidMatrix) * (frontPosition + vEllipsoidCenter);
  vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);
  prevClip /= prevClip.w;
  vec2 prevUv = prevClip.xy * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * resolution;

  outputColor = color;
  outputDepthVelocity = vec3(frontDepth, velocity);
}
