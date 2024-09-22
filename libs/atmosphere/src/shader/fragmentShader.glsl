uniform vec3 cameraPosition;
uniform float exposure;
uniform vec3 sunDirection;
uniform vec2 sunSize;

in vec4 worldDirection;
layout(location = 0) out vec4 color;

void main() {
  vec3 viewDirection = normalize(worldDirection.xyz);
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    cameraPosition,
    viewDirection,
    0.0, // shadow length
    sunDirection,
    transmittance
  );
  if (dot(viewDirection, sunDirection) > sunSize.y) {
    radiance = radiance + transmittance * GetSolarRadiance();
  }
  color.rgb = radiance * exposure;
  color.a = 1.0;
}
