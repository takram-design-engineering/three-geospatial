uniform vec3 sunDirection;
uniform vec2 sunSize;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
layout(location = 0) out vec4 outputColor;

void main() {
  vec3 viewDirection = normalize(vWorldDirection);
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    vWorldPosition,
    viewDirection,
    0.0, // shadow length
    sunDirection,
    transmittance
  );
  if (dot(viewDirection, sunDirection) > sunSize.y) {
    radiance = radiance + transmittance * GetSolarRadiance();
  }
  outputColor = vec4(radiance, 1.0);
}
