uniform sampler2D normalBuffer;

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform float cameraHeight;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform float irradianceScale;
uniform float idealSphereAlpha;

varying vec3 vWorldPosition;
varying vec3 vWorldDirection;
varying vec3 vEllipsoidCenter;
varying vec3 vSkyEllipsoidCenter;
varying vec3 vEllipsoidRadiiSquared;

vec3 readNormal(const vec2 uv) {
  #ifdef OCT_ENCODED_NORMAL
  return unpackVec2ToNormal(texture2D(normalBuffer, uv).xy);
  #else
  return 2.0 * texture2D(normalBuffer, uv).xyz - 1.0;
  #endif // OCT_ENCODED_NORMAL
}

void correctGeometricError(inout vec3 worldPosition, inout vec3 worldNormal) {
  // Correct way is slerp, but this will be small-angle interpolation anyways.
  vec3 normal = normalize(1.0 / vEllipsoidRadiiSquared * worldPosition);
  vec3 position = u_bottom_radius * normal;
  worldNormal = mix(worldNormal, normal, idealSphereAlpha);
  worldPosition = mix(worldPosition, position, idealSphereAlpha);
}

#if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
vec3 getSunSkyIrradiance(
  const vec3 worldPosition,
  const vec3 worldNormal,
  const vec3 inputColor
) {
  // Assume lambertian BRDF. If both SUN_IRRADIANCE and SKY_IRRADIANCE are not
  // defined, regard the inputColor as radiance at the texel.
  vec3 albedo = inputColor * irradianceScale * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(
    worldPosition - vEllipsoidCenter,
    worldNormal,
    sunDirection,
    skyIrradiance
  );
  #if defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
  return albedo * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_IRRADIANCE)
  return albedo * sunIrradiance;
  #elif defined(SKY_IRRADIANCE)
  return albedo * skyIrradiance;
  #endif
}
#endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

#if defined(TRANSMITTANCE) || defined(INSCATTER)
void getTransmittanceInscatter(
  const vec3 worldPosition,
  const vec3 worldNormal,
  inout vec3 radiance
) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    vWorldPosition - vEllipsoidCenter,
    worldPosition - vEllipsoidCenter,
    0.0, // Shadow length
    sunDirection,
    transmittance
  );
  #if defined(TRANSMITTANCE)
  radiance = radiance * transmittance;
  #endif
  #if defined(INSCATTER)
  radiance = radiance + inscatter;
  #endif
}
#endif // defined(TRANSMITTANCE) || defined(INSCATTER)

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float depth = readDepth(uv);
  if (depth >= 1.0 - 1e-7) {
    #ifdef SKY
    vec3 viewPosition = vWorldPosition - vSkyEllipsoidCenter;
    vec3 rayDirection = normalize(vWorldDirection);
    outputColor.rgb = getSkyRadiance(
      viewPosition,
      rayDirection,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale
    );
    outputColor.a = 1.0;
    #else
    outputColor = inputColor;
    #endif // SKY
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
  #else
  viewNormal = readNormal(uv);
  #endif // RECONSTRUCT_NORMAL

  vec3 worldPosition =
    (inverseViewMatrix * vec4(viewPosition, 1.0)).xyz * METER_TO_UNIT_LENGTH;
  vec3 worldNormal = normalize(mat3(inverseViewMatrix) * viewNormal);

  #ifdef CORRECT_GEOMETRIC_ERROR
  correctGeometricError(worldPosition, worldNormal);
  #endif // CORRECT_GEOMETRIC_ERROR

  vec3 radiance;
  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  radiance = getSunSkyIrradiance(worldPosition, worldNormal, inputColor.rgb);
  #else
  radiance = inputColor.rgb;
  #endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  getTransmittanceInscatter(worldPosition, worldNormal, radiance);
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);
}
