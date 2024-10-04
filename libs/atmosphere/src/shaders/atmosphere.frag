uniform vec3 sunDirection;

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
    0.0, // Shadow length
    sunDirection,
    transmittance
  );

  #ifdef SUN
  if (dot(viewDirection, sunDirection) > cos(u_sun_angular_radius)) {
    radiance = radiance + transmittance * GetSolarRadiance();
  }
  outputColor = vec4(radiance, 1.0);
}
