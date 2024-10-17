uniform vec3 sunDirection;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vHeightAdjustment;

layout(location = 0) out vec4 outputColor;

void main() {
  vec3 worldPosition = vWorldPosition - vHeightAdjustment;
  vec3 viewDirection = normalize(vWorldDirection);

  vec3 skyIrradiance = GetSkyIrradiance(
    worldPosition,
    viewDirection,
    sunDirection
  );
  vec3 skyTransmittance = GetSkyTransmittance(worldPosition, viewDirection);
  vec3 radiance = skyIrradiance * skyTransmittance;

  #ifdef SUN
  float viewDotSun = dot(viewDirection, sunDirection);
  if (viewDotSun > cos(u_sun_angular_radius)) {
    vec3 sunTransmittance = GetSkyTransmittance(worldPosition, sunDirection);
    radiance += GetSolarRadiance() * sunTransmittance;
  }
  #endif

  outputColor = vec4(radiance, 1.0);
}
