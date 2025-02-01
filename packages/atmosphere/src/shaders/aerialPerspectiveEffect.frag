precision highp sampler2DArray;

#include "core/depth"
#include "core/packing"
#include "core/transform"
#include "core/raySphereIntersection"
#include "core/poissonDisk"
#include "parameters"
#include "functions"
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
uniform float irradianceScale;
uniform float idealSphereAlpha;

#ifdef HAS_COMPOSITE
uniform sampler2D compositeBuffer;
#endif // HAS_COMPOSITE

#ifdef HAS_SHADOW
uniform sampler2DArray shadowBuffer;
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];
uniform float shadowFar;
uniform float shadowTopHeight;
uniform float shadowRadius;
uniform sampler3D stbnTexture;
uniform int frame;
#endif // HAS_SHADOW

#ifdef HAS_SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // HAS_SHADOW_LENGTH

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
  vec3 spherePosition = u_bottom_radius * sphereNormal;
  normalECEF = mix(normalECEF, sphereNormal, idealSphereAlpha);
  positionECEF = mix(positionECEF, spherePosition, idealSphereAlpha);
}

#if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

vec3 getSunSkyIrradiance(
  const vec3 positionECEF,
  const vec3 normal,
  const vec3 inputColor,
  const float sunTransmittance
) {
  // Assume lambertian BRDF. If both SUN_IRRADIANCE and SKY_IRRADIANCE are not
  // defined, regard the inputColor as radiance at the texel.
  vec3 albedo = inputColor * irradianceScale * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(positionECEF, normal, sunDirection, skyIrradiance);

  #ifdef HAS_SHADOW
  sunIrradiance *= sunTransmittance;
  #endif // HAS_SHADOW

  #if defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
  return albedo * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_IRRADIANCE)
  return albedo * sunIrradiance;
  #elif defined(SKY_IRRADIANCE)
  return albedo * skyIrradiance;
  #endif // defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
}

#endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

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

#ifdef HAS_SHADOW

float getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;
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

float getDistanceToShadowTop(const vec3 positionECEF) {
  // Distance to the top of the shadows along the sun direction, which matches
  // the ray origin of BSM.
  return raySphereSecondIntersection(
    positionECEF / METER_TO_LENGTH_UNIT, // TODO: Make units consistent
    sunDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );
}

float readShadowOpticalDepth(const vec2 uv, const float distanceToTop, const int cascadeIndex) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth
  vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));
  return min(shadow.b, shadow.g * max(0.0, distanceToTop - shadow.r));
}

float sampleShadowOpticalDepthPCF(
  const vec3 worldPosition,
  const float distanceToTop,
  const int cascadeIndex
) {
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }

  vec2 texelSize = vec2(1.0) / vec2(textureSize(shadowBuffer, 0).xy);
  float sum = 0.0;
  #pragma unroll_loop_start
  for (int i = 0; i < POISSON_DISK_COUNT; ++i) {
    vec2 offset = poissonDisk[i];
    sum += readShadowOpticalDepth(
      uv + offset * shadowRadius * texelSize,
      distanceToTop,
      cascadeIndex
    );
  }
  #pragma unroll_loop_end
  return sum / float(POISSON_DISK_COUNT);
}

float sampleShadowOpticalDepth(
  const vec3 worldPosition,
  const vec3 positionECEF,
  const float jitter
) {
  float distanceToTop = getDistanceToShadowTop(positionECEF);
  if (distanceToTop <= 0.0) {
    return 0.0;
  }
  int cascadeIndex = getFadedCascadeIndex(worldPosition, jitter);
  return cascadeIndex >= 0
    ? sampleShadowOpticalDepthPCF(worldPosition, distanceToTop, cascadeIndex)
    : 0.0;
}

#endif // HAS_SHADOW

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, uv).r;
  #endif // HAS_SHADOW_LENGTH

  #ifdef HAS_COMPOSITE
  vec4 composite = texture(compositeBuffer, uv);
  if (composite.a == 1.0) {
    outputColor = composite;
    return;
  }
  #endif // HAS_COMPOSITE

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

    #ifdef HAS_COMPOSITE
    outputColor.rgb = outputColor.rgb * (1.0 - composite.a) + composite.rgb;
    #endif // HAS_COMPOSITE
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

  #ifdef HAS_SHADOW
  float stbn = getSTBN();
  float opticalDepth = sampleShadowOpticalDepth(worldPosition, positionECEF, stbn);
  float sunTransmittance = exp(-opticalDepth);
  #else // HAS_SHADOW
  float sunTransmittance = 1.0;
  #endif // HAS_SHADOW

  vec3 radiance;
  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  radiance = getSunSkyIrradiance(positionECEF, normalECEF, inputColor.rgb, sunTransmittance);
  #else // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  radiance = inputColor.rgb;
  #endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  applyTransmittanceInscatter(positionECEF, shadowLength, radiance);
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);

  #ifdef HAS_COMPOSITE
  outputColor.rgb = outputColor.rgb * (1.0 - composite.a) + composite.rgb;
  #endif // HAS_COMPOSITE
}
