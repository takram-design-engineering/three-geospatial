uniform vec3 sunDirection;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vHeightAdjustment;

layout(location = 0) out vec4 outputColor;

void main() {
  vec3 worldPosition = vWorldPosition - vHeightAdjustment;
  vec3 viewDirection = normalize(vWorldDirection);

  vec3 irradiance = GetSkyIrradiance(
    worldPosition,
    viewDirection,
    sunDirection
  );

  // This is a crude approximation, as sky irradiance is very smooth.
  vec3 radiance = irradiance / PI;
  float r = length(worldPosition);
  float rmu = dot(worldPosition, viewDirection);
  float mu = rmu / r;
  if (RayIntersectsGround(r, mu)) {
    radiance *= smoothstep(0.65, 0.0, -mu);
  }
  outputColor = vec4(radiance, 1.0);
}
