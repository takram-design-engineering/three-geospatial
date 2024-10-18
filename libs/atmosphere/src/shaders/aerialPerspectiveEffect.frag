uniform sampler2D normalBuffer;

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 sunDirection;
uniform float inputIntensity;

varying vec3 vWorldPosition;
varying vec3 vHeightAdjustment;

#ifndef DEPTH_THRESHOLD
#define DEPTH_THRESHOLD (1.0 - EPSILON)
#endif

float reverseLogDepth(const float depth) {
  #ifdef LOG_DEPTH
  float d = pow(2.0, depth * log2(cameraFar + 1.0)) - 1.0;
  float a = cameraFar / (cameraFar - cameraNear);
  float b = cameraFar * cameraNear / (cameraNear - cameraFar);
  return a + b / d;
  #else
  return depth;
  #endif
}

vec3 screenToView(const vec2 uv, const float depth, const float viewZ) {
  vec4 clip = vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  float clipW = projectionMatrix[2][3] * viewZ + projectionMatrix[3][3];
  clip *= clipW;
  return (inverseProjectionMatrix * clip).xyz;
}

vec3 readNormal(const vec2 uv) {
  return 2.0 * texture2D(normalBuffer, uv).xyz - 1.0;
}

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float depth = readDepth(uv);
  if (depth > DEPTH_THRESHOLD) {
    // TODO: Compute sky radiance here to reduce number of pixels to ray-march.
    // TODO: Apply transmittance to the stars.
    outputColor = inputColor;
    return;
  }
  depth = reverseLogDepth(depth);

  // Reconstruct position and normal in world space.
  vec3 viewPosition = screenToView(uv, depth, getViewZ(depth));
  vec3 worldPosition =
    (inverseViewMatrix * vec4(viewPosition, 1.0)).xyz * METER_TO_UNIT_LENGTH;

  #ifdef RECONSTRUCT_NORMAL
  vec3 dx = dFdx(viewPosition);
  vec3 dy = dFdy(viewPosition);
  vec3 viewNormal = normalize(cross(dx, dy));
  #else
  vec3 viewNormal = readNormal(uv);
  #endif // RECONSTRUCT_NORMAL

  vec3 worldNormal = normalize(mat3(inverseViewMatrix) * viewNormal);

  vec3 radiance = inputColor.rgb;

  // Assume lambertian BRDF. If both SUN_IRRADIANCE and SKY_IRRADIANCE are not
  // defined, regard the inputColor as radiance at the texel.
  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  vec3 albedo = inputColor.rgb * inputIntensity * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(
    worldPosition - vHeightAdjustment,
    worldNormal,
    sunDirection,
    skyIrradiance
  );
  #if defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
  radiance = albedo * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_IRRADIANCE)
  radiance = albedo * sunIrradiance;
  #elif defined(SKY_IRRADIANCE)
  radiance = albedo * skyIrradiance;
  #endif
  #endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    vWorldPosition - vHeightAdjustment,
    worldPosition - vHeightAdjustment,
    0.0, // TODO: Shadow length
    sunDirection,
    transmittance
  );
  #if defined(TRANSMITTANCE)
  radiance = radiance * transmittance;
  #endif
  #if defined(INSCATTER)
  radiance = radiance + inscatter;
  #endif
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);
}
