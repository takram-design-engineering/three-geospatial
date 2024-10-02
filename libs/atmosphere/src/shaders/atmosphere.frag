uniform vec3 sunDirection;
uniform vec3 sunParams;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vHeightAdjustment;
layout(location = 0) out vec4 outputColor;

void main() {
  vec3 viewDirection = normalize(vWorldDirection);
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    vWorldPosition - vHeightAdjustment,
    viewDirection,
    0.0, // shadow length
    sunDirection,
    transmittance
  );
  if (dot(viewDirection, sunDirection) > sunParams.y) {
    radiance = radiance + transmittance * GetSolarRadiance() * sunParams.z;
  }
  outputColor = vec4(radiance, 1.0);
}
