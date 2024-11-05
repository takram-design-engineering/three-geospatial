uniform sampler2D normalBuffer;

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform float cameraHeight;
uniform vec2 ellipsoidInterpolationRange;
uniform vec3 sunDirection;
uniform float albedoScale;

varying vec3 vWorldPosition;
varying vec3 vEllipsoidCenter;
varying vec3 vEllipsoidRadiiSquared;

vec3 readNormal(const vec2 uv) {
  #ifdef OCT_ENCODED_NORMAL
  return unpackVec2ToNormal(texture2D(normalBuffer, uv).xy);
  #else
  return 2.0 * texture2D(normalBuffer, uv).xyz - 1.0;
  #endif // OCT_ENCODED_NORMAL
}

void morphToSphere(
  float minHeight,
  float maxHeight,
  inout vec3 worldPosition,
  inout vec3 worldNormal
) {
  vec3 normal = normalize(1.0 / vEllipsoidRadiiSquared * worldPosition);
  vec3 position = u_bottom_radius * normal;
  float t = smoothstep(minHeight, maxHeight, cameraHeight);
  worldPosition = mix(worldPosition, position, t);
  // Correct way is slerp, but this will be small-angle interpolation anyways.
  worldNormal = mix(worldNormal, normal, t);
}

#if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
vec3 sunSkyIrradiance(
  const vec3 worldPosition,
  const vec3 worldNormal,
  const vec3 inputColor
) {
  // Assume lambertian BRDF. If both SUN_IRRADIANCE and SKY_IRRADIANCE are not
  // defined, regard the inputColor as radiance at the texel.
  vec3 albedo = inputColor * albedoScale * RECIPROCAL_PI;
  vec3 skyIrrIllum;
  vec3 sunIrrIllum = GetSunAndSkyIrrIllum(
    worldPosition - vEllipsoidCenter,
    worldNormal,
    sunDirection,
    skyIrrIllum
  );
  #if defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
  return albedo * (sunIrrIllum + skyIrrIllum);
  #elif defined(SUN_IRRADIANCE)
  return albedo * sunIrrIllum;
  #elif defined(SKY_IRRADIANCE)
  return albedo * skyIrrIllum;
  #endif
}
#endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

#if defined(TRANSMITTANCE) || defined(INSCATTER)
void transmittanceInscatter(
  const vec3 worldPosition,
  const vec3 worldNormal,
  inout vec3 radLum
) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadLumToPoint(
    vWorldPosition - vEllipsoidCenter,
    worldPosition - vEllipsoidCenter,
    0.0, // TODO: Shadow length
    sunDirection,
    transmittance
  );
  #if defined(TRANSMITTANCE)
  radLum = radLum * transmittance;
  #endif
  #if defined(INSCATTER)
  radLum = radLum + inscatter;
  #endif
}
#endif // defined(TRANSMITTANCE) || defined(INSCATTER)

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float depth = readDepth(uv);
  if (depth > 0.9999) {
    // TODO: Compute sky radiance here to reduce the total number of texels to
    // ray-march.
    outputColor = inputColor;
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

  #ifdef MORPH_TO_SPHERE
  morphToSphere(
    ellipsoidInterpolationRange.x,
    ellipsoidInterpolationRange.y,
    worldPosition,
    worldNormal
  );
  #endif // MORPH_TO_SPHERE

  vec3 radLum;
  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  radLum = sunSkyIrradiance(worldPosition, worldNormal, inputColor.rgb);
  #else
  radLum = inputColor.rgb;
  #endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  transmittanceInscatter(worldPosition, worldNormal, radLum);
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radLum, inputColor.a);
}
