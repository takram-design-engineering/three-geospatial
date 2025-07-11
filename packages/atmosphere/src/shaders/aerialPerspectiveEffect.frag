precision highp sampler2DArray;

#if defined(HAS_OVERLAY_SHADOW) || defined(HAS_SCENE_SHADOW) || defined(SCREEN_SPACE_SHADOW)
#define HAS_ANY_SHADOW
#endif // defined(HAS_OVERLAY_SHADOW) || defined(HAS_SCENE_SHADOW) || defined(SCREEN_SPACE_SHADOW)

#include "core/depth"
#include "core/math"
#include "core/packing"
#include "core/transform"

#if defined(HAS_OVERLAY_SHADOW) || defined(HAS_SCENE_SHADOW)
#include "core/cascadedShadow"
#include "core/interleavedGradientNoise"
#include "core/vogelDisk"
#endif // defined(HAS_OVERLAY_SHADOW) || defined(HAS_SCENE_SHADOW)

#ifdef HAS_OVERLAY_SHADOW
#include "core/raySphereIntersection"
#endif // HAS_OVERLAY_SHADOW

#ifdef SCREEN_SPACE_SHADOW
#include "core/screenSpaceRaycast"
#endif // SCREEN_SPACE_SHADOW

#include "bruneton/definitions"

uniform AtmosphereParameters atmosphere;
uniform vec3 sunSpectralRadianceToLuminance;
uniform vec3 skySpectralRadianceToLuminance;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "bruneton/common"
#include "bruneton/runtime"

#include "sky"

uniform sampler2D normalBuffer;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform float bottomRadius;
uniform vec3 ellipsoidCenter;
uniform mat4 inverseEllipsoidMatrix;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform float albedoScale;
uniform float idealSphereAlpha;

#ifdef HAS_ANY_SHADOW
uniform sampler3D stbnTexture;
uniform int frame;
#endif // HAS_ANY_SHADOW

#ifdef HAS_OVERLAY
uniform sampler2D overlayBuffer;
#endif // HAS_OVERLAY

#ifdef HAS_OVERLAY_SHADOW
struct OverlayShadow {
  sampler2DArray map;
  int cascadeCount;
  vec2 intervals[4];
  mat4 matrices[4];
  mat4 inverseMatrices[4];
  float far;
  float topHeight;
};
uniform OverlayShadow overlayShadow;
uniform float overlayShadowRadius;
#define overlayShadowMatrices overlayShadow.matrices
#define overlayShadowInverseMatrices overlayShadow.inverseMatrices
#endif // HAS_OVERLAY_SHADOW

#ifdef HAS_SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // HAS_SHADOW_LENGTH

#ifdef HAS_LIGHTING_MASK
uniform sampler2D lightingMaskBuffer;
#endif // HAS_LIGHTING_MASK

// prettier-ignore
#define LIGHTING_MASK_CHANNEL_ LIGHTING_MASK_CHANNEL

#ifdef HAS_SCENE_SHADOW
struct SceneShadow {
  sampler2D maps[4];
  int cascadeCount;
  vec2 intervals[4];
  mat4 matrices[4];
  mat4 inverseMatrices[4];
  float near;
  float far;
};
uniform SceneShadow sceneShadow;
uniform float sceneShadowRadius;
#define sceneShadowMaps sceneShadow.maps
#define sceneShadowMatrices sceneShadow.matrices
#define sceneShadowInverseMatrices sceneShadow.inverseMatrices
#endif // HAS_SCENE_SHADOW

varying vec3 vCameraPosition;
varying vec3 vRayDirection;
varying vec3 vEllipsoidCenter;
varying vec3 vGeometryEllipsoidCenter;
varying vec3 vEllipsoidRadiiSquared;

vec3 readNormal(const vec2 uv) {
  #ifdef OCT_ENCODED_NORMAL
  return unpackVec2ToNormal(texture(normalBuffer, uv).xy);
  #else // OCT_ENCODED_NORMAL
  return 2.0 * texture(normalBuffer, uv).xyz - 1.0;
  #endif // OCT_ENCODED_NORMAL
}

void correctGeometricError(inout vec3 positionECEF, inout vec3 normalECEF) {
  // TODO: The error is pronounced at the edge of the ellipsoid due to the
  // large difference between the sphere position and the unprojected position
  // at the current fragment. Calculating the sphere position from the fragment
  // UV may resolve this.

  // Correct way is slerp, but this will be small-angle interpolation anyways.
  vec3 sphereNormal = normalize(positionECEF / vEllipsoidRadiiSquared);
  vec3 spherePosition = atmosphere.bottom_radius * sphereNormal;
  normalECEF = mix(normalECEF, sphereNormal, idealSphereAlpha);
  positionECEF = mix(positionECEF, spherePosition, idealSphereAlpha);
}

#if defined(SUN_LIGHT) || defined(SKY_LIGHT)

vec3 getSunSkyIrradiance(
  const vec3 positionECEF,
  const vec3 normal,
  const vec3 inputColor,
  const float sunTransmittance
) {
  // Assume lambertian BRDF. If both SUN_LIGHT and SKY_LIGHT are not defined,
  // regard the inputColor as radiance at the texel.
  vec3 diffuse = inputColor * albedoScale * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(positionECEF, normal, sunDirection, skyIrradiance);
  sunIrradiance *= sunTransmittance;

  #if defined(SUN_LIGHT) && defined(SKY_LIGHT)
  return diffuse * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_LIGHT)
  return diffuse * sunIrradiance;
  #elif defined(SKY_LIGHT)
  return diffuse * skyIrradiance;
  #endif // defined(SUN_LIGHT) && defined(SKY_LIGHT)
}

#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)

#if defined(TRANSMITTANCE) || defined(INSCATTER)

void applyTransmittanceInscatter(const vec3 positionECEF, float shadowLength, inout vec3 radiance) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    vCameraPosition - vGeometryEllipsoidCenter,
    positionECEF,
    shadowLength,
    sunDirection,
    transmittance
  );
  #ifdef TRANSMITTANCE
  radiance = radiance * transmittance;
  #endif // TRANSMITTANCE
  #ifdef INSCATTER
  radiance = radiance + inscatter;
  #endif // INSCATTER
}

#endif // defined(TRANSMITTANCE) || defined(INSCATTER)

#ifdef HAS_ANY_SHADOW
float getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;
}
#endif // HAS_ANY_SHADOW

#ifdef HAS_OVERLAY_SHADOW

float getDistanceToShadowTop(const vec3 positionECEF) {
  // Distance to the top of the shadows along the sun direction, which matches
  // the ray origin of BSM.
  return raySphereSecondIntersection(
    positionECEF / METER_TO_LENGTH_UNIT, // TODO: Make units consistent
    sunDirection,
    vec3(0.0),
    bottomRadius + overlayShadow.topHeight
  );
}

float readShadowOpticalDepth(const vec2 uv, const float distanceToTop, const int cascadeIndex) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth
  vec4 value = texture(overlayShadow.map, vec3(uv, float(cascadeIndex)));
  return min(value.b, value.g * max(0.0, distanceToTop - value.r));
}

float sampleShadowOpticalDepthPCF(
  const vec3 worldPosition,
  const float distanceToTop,
  const float radius,
  const int cascadeIndex
) {
  vec4 clip = overlayShadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);
  clip /= clip.w;
  vec2 uv = clip.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }

  vec2 texelSize = vec2(1.0) / vec2(textureSize(overlayShadow.map, 0).xy);
  float sum = 0.0;
  vec2 offset;
  #pragma unroll_loop_start
  for (int i = 0; i < 16; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
    offset = vogelDisk(
      UNROLLED_LOOP_INDEX,
      SHADOW_SAMPLE_COUNT,
      interleavedGradientNoise(gl_FragCoord.xy) * PI2
    );
    sum += readShadowOpticalDepth(uv + offset * radius * texelSize, distanceToTop, cascadeIndex);
    #endif // UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
  }
  #pragma unroll_loop_end
  return sum / float(SHADOW_SAMPLE_COUNT);
}

float sampleShadowOpticalDepth(
  const vec3 worldPosition,
  const vec3 positionECEF,
  const float radius,
  const float jitter
) {
  float distanceToTop = getDistanceToShadowTop(positionECEF);
  if (distanceToTop <= 0.0) {
    return 0.0;
  }
  int cascadeIndex = getFadedCascadeIndex(
    viewMatrix,
    worldPosition,
    cameraNear,
    overlayShadow.far,
    overlayShadow.cascadeCount,
    overlayShadow.intervals,
    jitter
  );
  return cascadeIndex >= 0
    ? sampleShadowOpticalDepthPCF(worldPosition, distanceToTop, radius, cascadeIndex)
    : 0.0;
}

float deriveOverlayShadowRadius(const vec3 worldPosition) {
  vec4 clip = overlayShadowMatrices[0] * vec4(worldPosition, 1.0);
  clip /= clip.w;

  // Offset by 1px in each direction in shadow's clip coordinates.
  vec2 shadowSize = vec2(textureSize(overlayShadow.map, 0));
  vec3 offset = vec3(2.0 / shadowSize, 0.0);
  vec4 clipX = clip + offset.xzzz;
  vec4 clipY = clip + offset.zyzz;

  // Convert back to world space.
  vec4 worldX = overlayShadowInverseMatrices[0] * clipX;
  vec4 worldY = overlayShadowInverseMatrices[0] * clipY;

  // Project into the main camera's clip space.
  mat4 viewProjectionMatrix = projectionMatrix * viewMatrix;
  vec4 projected = viewProjectionMatrix * vec4(worldPosition, 1.0);
  vec4 projectedX = viewProjectionMatrix * worldX;
  vec4 projectedY = viewProjectionMatrix * worldY;
  projected /= projected.w;
  projectedX /= projectedX.w;
  projectedY /= projectedY.w;

  // Take the mean of pixel sizes.
  vec2 center = (projected.xy * 0.5 + 0.5) * resolution;
  vec2 offsetX = (projectedX.xy * 0.5 + 0.5) * resolution;
  vec2 offsetY = (projectedY.xy * 0.5 + 0.5) * resolution;
  float size = max(length(offsetX - center), length(offsetY - center));

  return remapClamped(size, 10.0, 50.0, 0.0, overlayShadowRadius);
}

#endif // HAS_OVERLAY_SHADOW

#ifdef HAS_SCENE_SHADOW

float readSceneShadow(const vec2 uv, const int cascadeIndex, const float compare) {
  float depth;
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    if (UNROLLED_LOOP_INDEX == cascadeIndex) {
      depth = unpackRGBAToDepth(texture(sceneShadowMaps[UNROLLED_LOOP_INDEX], uv));
    }
  }
  #pragma unroll_loop_end
  return step(depth, compare); // lit = 0, shadow = 1
}

float sampleSceneShadowPCF(const vec3 worldPosition, const int cascadeIndex, const float jitter) {
  vec4 clip = sceneShadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);
  clip /= clip.w;
  if (clip.z < -1.0 || clip.z > 1.0) {
    return 0.0; // Needs to test against clip space Z in this case.
  }
  vec2 uv = clip.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }

  vec2 texelSize;
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    if (UNROLLED_LOOP_INDEX == cascadeIndex) {
      texelSize = vec2(1.0) / vec2(textureSize(sceneShadowMaps[UNROLLED_LOOP_INDEX], 0).xy);
    }
  }
  #pragma unroll_loop_end

  float compare = clip.z * 0.5 + 0.5;
  float sum = 0.0;
  vec2 offset;
  #pragma unroll_loop_start
  for (int i = 0; i < 16; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
    offset = vogelDisk(
      UNROLLED_LOOP_INDEX,
      SHADOW_SAMPLE_COUNT,
      interleavedGradientNoise(gl_FragCoord.xy) * PI2
    );
    sum += readSceneShadow(uv + offset * sceneShadowRadius * texelSize, cascadeIndex, compare);
    #endif // UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
  }
  #pragma unroll_loop_end
  return sum / float(SHADOW_SAMPLE_COUNT);
}

float sampleSceneShadow(vec3 viewPosition, vec3 worldPosition, const float jitter) {
  int cascadeIndex = getFadedCascadeIndex(
    viewPosition,
    cameraNear,
    sceneShadow.far,
    sceneShadow.cascadeCount,
    sceneShadow.intervals,
    jitter
  );
  return cascadeIndex >= 0
    ? sampleSceneShadowPCF(worldPosition, cascadeIndex, jitter)
    : 0.0;
}

#ifdef DEBUG_SHOW_SCENE_SHADOW_MAP
float getCascadedSceneShadow(vec2 uv) {
  vec4 coord = vec4(uv, uv - 0.5) * 2.0;
  float depth = 0.0;
  if (uv.y > 0.5) {
    if (uv.x < 0.5) {
      depth = unpackRGBAToDepth(texture(sceneShadowMaps[0], coord.xw));
    } else if (sceneShadow.cascadeCount > 1) {
      depth = unpackRGBAToDepth(texture(sceneShadowMaps[1], coord.zw));
    }
  } else {
    if (uv.x < 0.5) {
      if (sceneShadow.cascadeCount > 2) {
        depth = unpackRGBAToDepth(texture(sceneShadowMaps[2], coord.xy));
      }
    } else {
      if (sceneShadow.cascadeCount > 3) {
        depth = unpackRGBAToDepth(texture(sceneShadowMaps[3], coord.zy));
      }
    }
  }
  return depth;
}
#endif // DEBUG_SHOW_SCENE_SHADOW_MAP

#endif // HAS_SCENE_SHADOW

#ifdef SCREEN_SPACE_SHADOW
float getScreenSpaceShadow(const vec3 viewPosition, const vec3 viewNormal, const float jitter) {
  vec2 hitUV;
  vec3 hitPosition;
  float rayLength;
  int iterationCount;
  const float normalBias = 0.0001;
  bool hit = screenSpaceRaycast(
    defaultScreenSpaceRaycastOptions,
    viewPosition - viewNormal * viewPosition.z * normalBias,
    (viewMatrix * vec4(sunDirection, 0.0)).xyz,
    projectionMatrix,
    texelSize,
    jitter,
    hitUV,
    hitPosition,
    rayLength,
    iterationCount
  );
  return hit
    ? 0.0
    : 1.0;
}
#endif // SCREEN_SPACE_SHADOW

float getSunTransmittance(
  const vec3 viewPosition,
  const vec3 worldPosition,
  const vec3 positionECEF,
  const float jitter
) {
  float transmittance = 1.0;

  #ifdef HAS_OVERLAY_SHADOW
  float radius = deriveOverlayShadowRadius(worldPosition);
  float opticalDepth = sampleShadowOpticalDepth(worldPosition, positionECEF, radius, jitter);
  transmittance *= exp(-opticalDepth);
  #endif // HAS_OVERLAY_SHADOW

  #ifdef HAS_SCENE_SHADOW
  transmittance *= 1.0 - sampleSceneShadow(viewPosition, worldPosition, jitter);
  #endif // HAS_SCENE_SHADOW

  return transmittance;
}

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  #if defined(HAS_LIGHTING_MASK) && defined(DEBUG_SHOW_LIGHTING_MASK)
  outputColor.rgb = vec3(texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_);
  outputColor.a = 1.0;
  return;
  #endif // defined(HAS_LIGHTING_MASK) && defined(DEBUG_SHOW_LIGHTING_MASK)

  #if defined(HAS_SCENE_SHADOW) && defined(DEBUG_SHOW_SCENE_SHADOW_MAP)
  outputColor.rgb = vec3(getCascadedSceneShadow(uv));
  outputColor.a = 1.0;
  return;
  #endif // defined(HAS_SCENE_SHADOW) && defined(DEBUG_SHOW_SCENE_SHADOW_MAP)

  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, uv).r;
  #endif // HAS_SHADOW_LENGTH

  #ifdef HAS_OVERLAY
  vec4 overlay = texture(overlayBuffer, uv);
  if (overlay.a == 1.0) {
    outputColor = overlay;
    return;
  }
  #endif // HAS_OVERLAY

  float depth = readDepth(uv);
  if (depth >= 1.0 - 1e-7) {
    #ifdef SKY
    vec3 rayDirection = normalize(vRayDirection);
    outputColor.rgb = getSkyRadiance(
      vCameraPosition - vEllipsoidCenter,
      rayDirection,
      shadowLength,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale
    );
    outputColor.a = 1.0;
    #else // SKY
    outputColor = inputColor;
    #endif // SKY

    #ifdef HAS_OVERLAY
    outputColor.rgb = outputColor.rgb * (1.0 - overlay.a) + overlay.rgb;
    #endif // HAS_OVERLAY
    return;
  }
  depth = reverseLogDepth(depth, cameraNear, cameraFar);

  // Reconstruct position and normal in world space.
  vec3 viewPosition = screenToView(
    uv,
    depth,
    getViewZ(depth),
    projectionMatrix,
    inverseProjectionMatrix
  );
  vec3 viewNormal;
  #ifdef RECONSTRUCT_NORMAL
  vec3 dx = dFdx(viewPosition);
  vec3 dy = dFdy(viewPosition);
  viewNormal = normalize(cross(dx, dy));
  #else // RECONSTRUCT_NORMAL
  viewNormal = readNormal(uv);
  #endif // RECONSTRUCT_NORMAL

  vec3 worldPosition = (inverseViewMatrix * vec4(viewPosition, 1.0)).xyz;
  vec3 worldNormal = normalize(mat3(inverseViewMatrix) * viewNormal);
  mat3 rotation = mat3(inverseEllipsoidMatrix);
  vec3 positionECEF = rotation * worldPosition * METER_TO_LENGTH_UNIT - vGeometryEllipsoidCenter;
  vec3 normalECEF = rotation * worldNormal;

  #ifdef CORRECT_GEOMETRIC_ERROR
  correctGeometricError(positionECEF, normalECEF);
  #endif // CORRECT_GEOMETRIC_ERROR

  float sunTransmittance = 1.0;

  #ifdef HAS_ANY_SHADOW
  float stbn = getSTBN();
  sunTransmittance *= getSunTransmittance(viewPosition, worldPosition, positionECEF, stbn);
  #ifdef SCREEN_SPACE_SHADOW
  sunTransmittance *= getScreenSpaceShadow(viewPosition, viewNormal, stbn);
  #endif // SCREEN_SPACE_SHADOW
  #endif // HAS_ANY_SHADOW

  vec3 radiance;
  #if defined(SUN_LIGHT) || defined(SKY_LIGHT)
  radiance = getSunSkyIrradiance(positionECEF, normalECEF, inputColor.rgb, sunTransmittance);
  #ifdef HAS_LIGHTING_MASK
  float lightingMask = texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_;
  radiance = mix(inputColor.rgb, radiance, lightingMask);
  #endif // HAS_LIGHTING_MASK
  #else // defined(SUN_LIGHT) || defined(SKY_LIGHT)
  radiance = inputColor.rgb;
  #endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  applyTransmittanceInscatter(positionECEF, shadowLength, radiance);
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);

  #ifdef HAS_OVERLAY
  outputColor.rgb = outputColor.rgb * (1.0 - overlay.a) + overlay.rgb;
  #endif // HAS_OVERLAY
}
