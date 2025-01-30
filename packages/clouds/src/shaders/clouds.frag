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

#if !defined(RECIPROCAL_PI4)
#define RECIPROCAL_PI4 (0.07957747154594767)
#endif // !defined(RECIPROCAL_PI4)

uniform sampler2D depthBuffer;
uniform mat4 viewMatrix;
uniform mat4 reprojectionMatrix;
uniform float cameraNear;
uniform float cameraFar;
uniform float cameraHeight;
uniform vec2 temporalJitter;
uniform vec2 targetUvScale;
uniform float mipLevelScale;

// Scattering
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
uniform float perspectiveStepScale;

// Secondary raymarch
uniform int maxSunIterations;
uniform int maxGroundIterations;
uniform float minSecondaryStepSize;

// Beer shadow map
uniform sampler2DArray shadowBuffer;
uniform vec2 shadowTexelSize;
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];
uniform float shadowFar;
uniform float shadowFilterRadius;
uniform float shadowExtensionScale;

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

vec3 ECEFToWorld(const vec3 positionECEF) {
  return mat3(ellipsoidMatrix) * (positionECEF + vEllipsoidCenter);
}

int getCascadeIndex(const vec3 worldPosition) {
  vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
  float depth = viewZToOrthographicDepth(viewPosition.z, cameraNear, shadowFar);
  vec2 interval;
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_CASCADE_COUNT
    interval = shadowIntervals[i];
    if (depth >= interval.x && depth < interval.y) {
      return UNROLLED_LOOP_INDEX;
    }
    #endif // UNROLLED_LOOP_INDEX < SHADOW_CASCADE_COUNT
  }
  #pragma unroll_loop_end
  return SHADOW_CASCADE_COUNT - 1;
}

// Reference: https://github.com/mrdoob/three.js/blob/r171/examples/jsm/csm/CSMShader.js
int getFadedCascadeIndex(const vec3 worldPosition, const float jitter) {
  vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
  float depth = viewZToOrthographicDepth(viewPosition.z, cameraNear, shadowFar);

  vec2 interval;
  float intervalCenter;
  float closestEdge;
  float margin;
  int nextIndex = -1;
  int prevIndex = -1;
  float alpha;

  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_CASCADE_COUNT
    interval = shadowIntervals[i];
    intervalCenter = (interval.x + interval.y) * 0.5;
    closestEdge = depth < intervalCenter ? interval.x : interval.y;
    margin = closestEdge * closestEdge * 0.5;
    interval += margin * vec2(-0.5, 0.5);

    if (depth >= interval.x && depth < interval.y) {
      prevIndex = nextIndex;
      nextIndex = UNROLLED_LOOP_INDEX;
      alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);
    }
    #endif // UNROLLED_LOOP_INDEX < SHADOW_CASCADE_COUNT
  }
  #pragma unroll_loop_end

  return jitter <= alpha
    ? nextIndex
    : prevIndex;
}

vec2 getShadowUv(const vec3 worldPosition, const int cascadeIndex) {
  vec4 clip = shadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
}

float getDistanceToShadowTop(const vec3 rayPosition) {
  // Distance to the top of the shadows along the sun direction, which matches
  // the ray origin of BSM.
  return raySphereSecondIntersection(
    rayPosition,
    sunDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );
}

#ifdef DEBUG_SHOW_CASCADES

const vec3 cascadeColors[4] = vec3[4](
  vec3(1.0, 0.0, 0.0),
  vec3(0.0, 1.0, 0.0),
  vec3(0.0, 0.0, 1.0),
  vec3(1.0, 1.0, 0.0)
);

vec3 getCascadeColor(const vec3 rayPosition) {
  vec3 worldPosition = ECEFToWorld(rayPosition);
  int cascadeIndex = getCascadeIndex(worldPosition);
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(1.0);
  }
  return cascadeColors[cascadeIndex];
}

vec3 getFadedCascadeColor(const vec3 rayPosition, const float jitter) {
  vec3 worldPosition = ECEFToWorld(rayPosition);
  int cascadeIndex = getFadedCascadeIndex(worldPosition, jitter);
  return cascadeIndex >= 0
    ? cascadeColors[cascadeIndex]
    : vec3(1.0);
}

#endif // DEBUG_SHOW_CASCADES

float readShadowOpticalDepth(const vec2 uv, const float distanceToTop, const int cascadeIndex) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth
  vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));
  return min(shadow.b * shadowExtensionScale, shadow.g * max(0.0, distanceToTop - shadow.r));
}

float sampleShadowOpticalDepthPCF(
  const vec3 worldPosition,
  const float distanceToTop,
  const float radius,
  const int cascadeIndex
) {
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  if (radius < 0.1) {
    return readShadowOpticalDepth(uv, distanceToTop, cascadeIndex);
  }
  vec4 d1 = vec4(-shadowTexelSize.xy, shadowTexelSize.xy) * radius;
  vec4 d2 = d1 * 0.5;
  // prettier-ignore
  return (1.0 / 17.0) * (
    readShadowOpticalDepth(uv + d1.xy, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(0.0, d1.y), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d1.zy, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d2.xy, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(0.0, d2.y), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d2.zy, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(d1.x, 0.0), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(d2.x, 0.0), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(d2.z, 0.0), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(d1.z, 0.0), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d2.xw, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(0.0, d2.w), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d2.zw, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d1.xw, distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + vec2(0.0, d1.w), distanceToTop, cascadeIndex) +
    readShadowOpticalDepth(uv + d1.zw, distanceToTop, cascadeIndex)
  );
}

float sampleShadowOpticalDepth(const vec3 rayPosition, const float radius, const float jitter) {
  float distanceToTop = getDistanceToShadowTop(rayPosition);
  if (distanceToTop <= 0.0) {
    return 0.0;
  }
  vec3 worldPosition = ECEFToWorld(rayPosition);
  int cascadeIndex = getFadedCascadeIndex(worldPosition, jitter);
  return cascadeIndex >= 0
    ? sampleShadowOpticalDepthPCF(worldPosition, distanceToTop, radius, cascadeIndex)
    : 0.0;
}

vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {
  vec2 g2 = g * g;
  vec2 denom = max(vec2(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5)));
  return RECIPROCAL_PI4 * ((1.0 - g2) / denom);
}

#ifdef ACCURATE_PHASE_FUNCTION

float draine(float u, float g, float a) {
  float g2 = g * g;
  return (1.0 - g2) *
  (1.0 + a * u * u) /
  (4.0 * (1.0 + a * (1.0 + 2.0 * g2) / 3.0) * PI * pow(1.0 + g2 - 2.0 * g * u, 1.5));
}

// Reference: https://research.nvidia.com/labs/rtr/approximate-mie/
float phaseFunction(const float cosTheta, const float attenuation) {
  const float gHG = 0.18702876788543576;
  const float gD = 0.5937905847209213;
  const float alpha = 27.113693722212247;
  const float weight = 0.4981594843291369;
  return mix(
    henyeyGreenstein(vec2(gHG) * attenuation, cosTheta).x,
    draine(cosTheta, gD * attenuation, alpha),
    weight
  );
}

#else // ACCURATE_PHASE_FUNCTION

float phaseFunction(const float cosTheta, const float attenuation) {
  vec2 g = vec2(scatterAnisotropy1, scatterAnisotropy2);
  vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);
  // A similar approximation is described in the Frostbite's paper, where phase
  // angle is attenuated instead of anisotropy.
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}

#endif // ACCURATE_PHASE_FUNCTION

float marchOpticalDepth(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const int maxIterations,
  const float mipLevel,
  const float jitter
) {
  int iterations = int(max(0.0, remap(mipLevel, 0.0, 1.0, float(maxIterations), 1.0) - jitter));
  if (iterations == 0) {
    // Fudge factor to approximate the mean optical depth.
    // TODO: Remove it.
    return 0.5;
  }
  float stepSize = minSecondaryStepSize / float(iterations);
  float rayDistance = stepSize * jitter;
  float opticalDepth = 0.0;
  float stepScale = 1.0;
  float prevStepScale = 0.0;
  for (int i = 0; i < iterations; ++i) {
    vec3 position = rayDistance * rayDirection + rayOrigin;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
    opticalDepth += media.extinction * (stepScale - prevStepScale) * stepSize;
    rayDistance += stepSize * stepScale;
    prevStepScale = stepScale;
    stepScale *= 2.0;
  }
  return opticalDepth;
}

float multipleScattering(const float opticalDepth, const float cosTheta) {
  // Multiple scattering approximation
  // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  // a: attenuation, b: contribution, c: phase attenuation
  vec3 coeffs = vec3(1.0); // [a, b, c]
  const vec3 attenuation = vec3(0.5, 0.5, 0.5); // Should satisfy a <= b
  float scattering = 0.0;
  float beerLambert;
  #pragma unroll_loop_start
  for (int i = 0; i < 12; ++i) {
    #if UNROLLED_LOOP_INDEX < MULTI_SCATTERING_OCTAVES
    beerLambert = exp(-opticalDepth * coeffs.y);
    scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);
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
  const float rayStartTexelsPerPixel,
  const vec3 sunDirection,
  out float frontDepth,
  out ivec3 sampleCount
) {
  vec3 radianceIntegral = vec3(0.0);
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  float stepSize = minStepSize;
  // I don't understand why spatial aliasing remains unless doubling the jitter.
  float rayDistance = stepSize * jitter * 2.0;
  float cosTheta = dot(sunDirection, rayDirection);

  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;

    // Sample rough weather.
    float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    #ifdef DEBUG_SHOW_SAMPLE_COUNT
    ++sampleCount.x;
    #endif // DEBUG_SHOW_SAMPLE_COUNT

    if (!any(greaterThan(weather.density, vec4(minDensity)))) {
      // Step longer in empty space.
      // TODO: This produces banding artifacts.
      // Possible improvement: Binary search refinement
      stepSize *= perspectiveStepScale;
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
      continue;
    }

    // Sample detailed participating media.
    MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);

    if (media.extinction > minExtinction) {
      vec3 skyIrradiance;
      vec3 sunIrradiance = GetSunAndSkyIrradiance(
        position * METER_TO_LENGTH_UNIT,
        sunDirection,
        skyIrradiance
      );
      vec3 surfaceNormal = normalize(position);

      // Obtain the optical depth at the position from BSM.
      float opticalDepth = 0.0;
      if (height < shadowTopHeight) {
        opticalDepth += sampleShadowOpticalDepth(
          position,
          // Apply PCF only when the sun is close to the horizon.
          shadowFilterRadius * saturate(1.0 - remap(dot(sunDirection, surfaceNormal), 0.0, 0.1)),
          jitter
        );
      }

      // March optical depth to the sun for finer details, which BSM lacks.
      opticalDepth += marchOpticalDepth(position, sunDirection, maxSunIterations, mipLevel, jitter);

      // TODO: It's constant. Move to vertex shader or uniform.
      vec3 albedo = vec3(media.scattering / media.extinction);

      // I'm not sure skyIrradiance should be included in the scattering term.
      float scattering = multipleScattering(opticalDepth, cosTheta);
      vec3 radiance = albedo * scattering * (sunIrradiance + skyIrradiance);

      #ifdef GROUND_IRRADIANCE
      // Fudge factor for the irradiance from ground.
      if (height < shadowTopHeight && mipLevel < 0.5) {
        float opticalDepthToGround = marchOpticalDepth(
          position,
          -surfaceNormal,
          maxGroundIterations,
          mipLevel,
          jitter
        );
        vec3 skyIrradiance;
        vec3 sunIrradiance = GetSunAndSkyIrradiance(
          (position - surfaceNormal * height) * METER_TO_LENGTH_UNIT,
          sunDirection,
          skyIrradiance
        );
        const float groundAlbedo = 0.3;
        vec3 groundIrradiance = skyIrradiance + (1.0 - coverage) * sunIrradiance * RECIPROCAL_PI2;
        vec3 bouncedLight = groundAlbedo * RECIPROCAL_PI * groundIrradiance;
        vec3 bouncedIrradiance = bouncedLight * exp(-opticalDepthToGround);
        radiance += albedo * bouncedIrradiance * RECIPROCAL_PI4 * groundIrradianceScale;
      }
      #endif // GROUND_IRRADIANCE

      // Crude approximation of sky gradient. Better than none in the shadows.
      float skyGradient = dot(0.5 + weather.heightFraction, media.weight);
      // Assume isotropic scattering.
      radiance += albedo * skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyIrradianceScale;

      // Finally multiply by extinction (redundant but kept for clarity).
      radiance *= media.extinction;

      #ifdef POWDER
      radiance *= 1.0 - powderScale * exp(-media.extinction * powderExponent);
      #endif // POWDER

      #ifdef DEBUG_SHOW_CASCADES
      if (height < shadowTopHeight) {
        radiance = 1e-3 * getFadedCascadeColor(position, jitter);
      }
      #endif // DEBUG_SHOW_CASCADES

      // Energy-conserving analytical integration of scattered light
      // See 5.6.3 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
      float transmittance = exp(-media.extinction * stepSize);
      float clampedExtinction = max(media.extinction, 1e-7);
      vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedExtinction;
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
    stepSize *= perspectiveStepScale;
    rayDistance += stepSize;
  }

  // The final product of 5.9.1 and we'll evaluate this in aerial perspective.
  frontDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : -1.0;

  return vec4(
    radianceIntegral,
    saturate(1.0 - remap(transmittanceIntegral, minTransmittance, 1.0))
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
  float rayDistance = stepSize * jitter;
  const float attenuationFactor = 1.0 - 1e-3;
  float attenuation = 1.0;

  for (int i = 0; i < maxShadowLengthIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;
    float opticalDepth = sampleShadowOpticalDepth(position, 0.0, jitter);
    shadowLength += (1.0 - exp(-opticalDepth)) * stepSize * attenuation;

    // Hack to prevent over-integration of shadow length. The shadow should be
    // attenuated by the inscatter as the ray travels further.
    attenuation *= attenuationFactor;
    if (attenuation < 1e-5) {
      break;
    }

    stepSize *= perspectiveStepScale;
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
  float clampedAlpha = max(color.a, 1e-7);
  color.rgb = mix(vec3(0.0), color.rgb * transmittance / clampedAlpha + inscatter, color.a);
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

  vec4 firstIntersections;
  vec4 secondIntersections;
  raySphereIntersections(
    cameraPosition,
    rayDirection,
    bottomRadius + vec4(0.0, minHeight, maxHeight, shadowTopHeight),
    firstIntersections,
    secondIntersections
  );

  if (cameraHeight < minHeight) {
    // View below the clouds
    if (intersectsGround) {
      rayNearFar = vec2(-1.0); // No clouds to the ground
    } else {
      rayNearFar = vec2(secondIntersections.y, secondIntersections.z);
      rayNearFar.y = min(rayNearFar.y, maxRayDistance);
    }
  } else if (cameraHeight < maxHeight) {
    // View inside the total cloud layer
    if (intersectsGround) {
      rayNearFar = vec2(cameraNear, firstIntersections.y);
    } else {
      rayNearFar = vec2(cameraNear, secondIntersections.z);
    }
  } else {
    // View above the clouds
    rayNearFar = vec2(firstIntersections.z, secondIntersections.z);
    if (intersectsGround) {
      // Clamp the ray at the min height.
      rayNearFar.y = firstIntersections.y;
    }
  }

  #ifdef SHADOW_LENGTH
  if (cameraHeight < shadowTopHeight) {
    if (intersectsGround) {
      shadowLengthRayNearFar = vec2(cameraNear, firstIntersections.x);
    } else {
      shadowLengthRayNearFar = vec2(cameraNear, secondIntersections.w);
    }
  } else {
    shadowLengthRayNearFar = vec2(firstIntersections.w, secondIntersections.w);
    if (intersectsGround) {
      // Clamp the ray at the ground.
      shadowLengthRayNearFar.y = firstIntersections.x;
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

  #if !defined(DEBUG_SHOW_SHADOW_MAP_TYPE)
  #define DEBUG_SHOW_SHADOW_MAP_TYPE (0)
  #endif // !defined(DEBUG_SHOW_SHADOW_MAP_TYPE

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

void clampRaysAtSceneObjects(const vec3 rayDirection, inout vec2 nearFar1, inout vec2 nearFar2) {
  float depth = readDepth(vUv * targetUvScale + temporalJitter);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    float viewZ = getViewZ(depth);
    float rayDistance = -viewZ / dot(rayDirection, vCameraDirection);
    nearFar1.y = min(nearFar1.y, rayDistance);
    nearFar2.y = min(nearFar2.y, rayDistance);
  }
}

// TODO: Try separating the shadow length raymarch to another pass, as it
// introduces many branches which may decrease coherency.

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
  clampRaysAtSceneObjects(rayDirection, rayNearFar, shadowLengthRayNearFar);

  float stbn = getSTBN();

  if (any(lessThan(rayNearFar, vec2(0.0)))) {
    #ifdef SHADOW_LENGTH
    if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
      outputShadowLength = marchShadowLength(
        shadowLengthRayNearFar.x * rayDirection + cameraPosition,
        rayDirection,
        shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
        stbn
      );
    }
    #endif // SHADOW_LENGTH

    outputColor = vec4(0.0);
    outputDepthVelocity = vec3(0.0);
    return; // Intersects with the ground, or no intersections.
  }

  if (rayNearFar.y < rayNearFar.x) {
    #ifdef SHADOW_LENGTH
    if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
      outputShadowLength = marchShadowLength(
        shadowLengthRayNearFar.x * rayDirection + cameraPosition,
        rayDirection,
        shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
        stbn
      );
    }
    #endif // SHADOW_LENGTH

    // TODO: We can calculate velocity here, which reduces occlusion errors at
    // the edges, but suffers from floating-point precision errors on near
    // objects.
    // vec3 frontPosition = cameraPosition + rayNearFar.y * rayDirection;
    // vec3 frontPositionWorld = ECEFToWorld(frontPosition);
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
  outputColor = vec4(vec3(checker(globeUv, localWeatherRepeat)), 1.0);
  outputDepthVelocity = vec3(0.0);
  outputShadowLength = 0.0;
  return;
  #endif // DEBUG_SHOW_UV

  float mipLevel = getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale;
  mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));

  float frontDepth;
  ivec3 sampleCount = ivec3(0);
  vec4 color = marchClouds(
    rayOrigin,
    rayDirection,
    rayNearFar.y - rayNearFar.x,
    stbn,
    pow(2.0, mipLevel),
    sunDirection,
    frontDepth,
    sampleCount
  );

  #ifdef DEBUG_SHOW_SAMPLE_COUNT
  outputColor = vec4(vec3(sampleCount) / vec3(500.0, 5.0, 5.0), 1.0);
  outputDepthVelocity = vec3(0.0);
  outputShadowLength = 0.0;
  return;
  #endif // DEBUG_SHOW_SAMPLE_COUNT

  // Front depth will be -1.0 when no samples are accumulated.
  float frontDepthStep = step(0.0, frontDepth);
  frontDepth = mix(rayNearFar.y, rayNearFar.x + frontDepth, frontDepthStep);

  // Clamp the shadow length ray at the clouds.
  shadowLengthRayNearFar.y = mix(
    shadowLengthRayNearFar.y,
    min(frontDepth, shadowLengthRayNearFar.y),
    // Interpolate by the alpha for smoother edges.
    frontDepthStep * color.a
  );

  #ifdef SHADOW_LENGTH
  if (all(greaterThanEqual(shadowLengthRayNearFar, vec2(0.0)))) {
    outputShadowLength = marchShadowLength(
      shadowLengthRayNearFar.x * rayDirection + cameraPosition,
      rayDirection,
      shadowLengthRayNearFar.y - shadowLengthRayNearFar.x,
      stbn
    );
  }
  #endif // SHADOW_LENGTH

  // Apply aerial perspective.
  vec3 frontPosition = cameraPosition + frontDepth * rayDirection;
  applyAerialPerspective(cameraPosition, frontPosition, outputShadowLength, color);
  outputColor = color;

  // Velocity for temporal resolution.
  vec3 frontPositionWorld = ECEFToWorld(frontPosition);
  vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);
  prevClip /= prevClip.w;
  vec2 prevUv = prevClip.xy * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * resolution;
  outputDepthVelocity = vec3(frontDepth, velocity);
}
