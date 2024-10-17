uniform vec3 sunDirection;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vHeightAdjustment;

layout(location = 0) out vec4 outputColor;

// TODO: Optimization
void main() {
  vec3 worldPosition = vWorldPosition - vHeightAdjustment;
  vec3 viewDirection = normalize(vWorldDirection);

  vec3 skyIrradiance;
  GetSunAndSkyIrradiance(
    worldPosition,
    viewDirection,
    sunDirection,
    skyIrradiance
  );

  vec3 skyTransmittance;
  GetSkyRadiance(
    worldPosition,
    viewDirection,
    0.0,
    sunDirection,
    skyTransmittance
  );

  vec3 sunTransmittance;
  GetSkyRadiance(
    worldPosition,
    sunDirection,
    0.0,
    sunDirection,
    sunTransmittance
  );

  vec3 radiance = skyIrradiance * skyTransmittance;
  float viewDotSun = dot(viewDirection, sunDirection);
  if (viewDotSun > cos(u_sun_angular_radius)) {
    radiance += GetSolarRadiance() * sunTransmittance;
  }

  outputColor = vec4(radiance, 1.0);
}
