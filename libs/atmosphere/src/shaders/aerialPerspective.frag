uniform sampler2D normalBuffer;

uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform mat4 cameraMatrixWorld;
uniform vec3 sunDirection;
uniform float inputIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldDirection; // Not used for now.

#ifndef DEPTH_THRESHOLD
#define DEPTH_THRESHOLD (1.0 - EPSILON)
#endif

float normalizeDepth(const float depth) {
  #ifdef LOG_DEPTH
  float d = pow(2.0, depth * log2(cameraFar + 1.0)) - 1.0;
  float a = cameraFar / (cameraFar - cameraNear);
  float b = cameraFar * cameraNear / (cameraNear - cameraFar);
  return a + b / d;
  #else
  return depth;
  #endif
}

vec3 screenToWorld(const vec2 uv, const float depth) {
  vec4 ndc = vec4(vec3(uv.xy, depth) * 2.0 - 1.0, 1.0);
  vec4 clip = inverseProjectionMatrix * ndc;
  vec4 view = inverseViewMatrix * (clip / clip.w);
  return view.xyz;
}

vec3 readNormal(const vec2 uv) {
  return 2.0 * texture2D(normalBuffer, uv).xyz - 1.0;
}

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float depth = readDepth(uv);
  if (depth > DEPTH_THRESHOLD) {
    outputColor = inputColor;
    return;
  }

  // Reconstruct position and normal in world space.
  depth = normalizeDepth(depth);
  float viewZ = getViewZ(depth);
  vec3 worldPosition = screenToWorld(uv, depth) * METER_TO_UNIT_LENGTH;
  vec3 viewNormal = readNormal(uv);
  vec3 worldNormal = normalize(mat3(inverseViewMatrix) * viewNormal);

  vec3 radiance = inputColor.rgb * inputIntensity;

  #if defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(
    worldPosition,
    worldNormal,
    sunDirection,
    skyIrradiance
  );
  #if defined(SUN_IRRADIANCE) && defined(SKY_IRRADIANCE)
  radiance = radiance * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_IRRADIANCE)
  radiance = radiance + radiance * sunIrradiance;
  #elif defined(SKY_IRRADIANCE)
  radiance = radiance + radiance * skyIrradiance;
  #endif
  #endif // defined(SUN_IRRADIANCE) || defined(SKY_IRRADIANCE)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    vWorldPosition,
    worldPosition,
    0.0, // TODO: Shadow length
    sunDirection,
    transmittance
  );
  #if defined(TRANSMITTANCE) && defined(INSCATTER)
  radiance = radiance * transmittance + inscatter;
  #elif defined(TRANSMITTANCE)
  radiance = radiance * transmittance;
  #elif defined(INSCATTER)
  radiance = radiance + inscatter;
  #endif
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);
}
