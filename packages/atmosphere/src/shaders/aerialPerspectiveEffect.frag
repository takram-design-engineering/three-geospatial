precision highp sampler2DArray;

#include "core/depth"
#include "core/packing"
#include "core/transform"
#include "core/raySphereIntersection"
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
  const float shadowTransmittance
) {
  // Assume lambertian BRDF. If both SUN_IRRADIANCE and SKY_IRRADIANCE are not
  // defined, regard the inputColor as radiance at the texel.
  vec3 albedo = inputColor * irradianceScale * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(positionECEF, normal, sunDirection, skyIrradiance);

  #ifdef HAS_SHADOW
  sunIrradiance *= shadowTransmittance;
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

float sampleShadowOpticalDepth(const float distanceToTop, const vec2 uv, const int index) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth
  vec4 shadow = texture(shadowBuffer, vec3(uv, float(index)));
  return min(shadow.b, shadow.g * max(0.0, distanceToTop - shadow.r));
}

float sampleShadowOpticalDepthPCF(const vec3 worldPosition, const vec3 positionECEF) {
  int index = getCascadeIndex(worldPosition);
  vec4 point = shadowMatrices[index] * vec4(worldPosition, 1.0);
  point /= point.w;
  vec2 uv = point.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }

  float distanceToTop = raySphereSecondIntersection(
    positionECEF / METER_TO_UNIT_LENGTH, // TODO: Make units consistent
    sunDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );

  vec2 texelSize = vec2(1.0) / vec2(textureSize(shadowBuffer, 0).xy);
  vec4 d1 = vec4(-texelSize.xy, texelSize.xy) * shadowRadius;
  vec4 d2 = d1 * 0.5;
  // prettier-ignore
  return (1.0 / 17.0) * (
    sampleShadowOpticalDepth(distanceToTop, uv + d1.xy, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(0.0, d1.y), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d1.zy, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d2.xy, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(0.0, d2.y), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d2.zy, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(d1.x, 0.0), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(d2.x, 0.0), index) +
    sampleShadowOpticalDepth(distanceToTop, uv, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(d2.z, 0.0), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(d1.z, 0.0), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d2.xw, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(0.0, d2.w), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d2.zw, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d1.xw, index) +
    sampleShadowOpticalDepth(distanceToTop, uv + vec2(0.0, d1.w), index) +
    sampleShadowOpticalDepth(distanceToTop, uv + d1.zw, index)
  );
}

#endif // HAS_SHADOW

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, uv).r;
  // outputColor = vec4(vec3(shadowLength * 0.005), 1.0);
  // return;
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
  vec3 positionECEF = rotation * worldPosition * METER_TO_UNIT_LENGTH - vGeometryEllipsoidCenter;
  vec3 normalECEF = rotation * worldNormal;

  #ifdef CORRECT_GEOMETRIC_ERROR
  correctGeometricError(positionECEF, normalECEF);
  #endif // CORRECT_GEOMETRIC_ERROR

  #ifdef HAS_SHADOW
  float opticalDepth = sampleShadowOpticalDepthPCF(worldPosition, positionECEF);
  float shadowTransmittance = exp(-opticalDepth);
  #else // HAS_SHADOW
  float shadowTransmittance = 1.0;
  #endif // HAS_SHADOW

  vec3 radiance;
  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  radiance = getSunSkyIrradiance(positionECEF, normalECEF, inputColor.rgb, shadowTransmittance);
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
