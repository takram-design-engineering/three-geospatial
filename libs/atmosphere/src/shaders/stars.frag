uniform vec3 sunDirection;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vEarthCenter;

layout(location = 0) out vec4 outputColor;

in vec3 vColor;

void main() {
  #ifdef BACKGROUND
  vec3 viewDirection = normalize(vWorldDirection);
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    vWorldPosition - vEarthCenter,
    viewDirection,
    0.0,
    sunDirection,
    transmittance
  );
  radiance += transmittance * vColor;
  outputColor = vec4(radiance, 1.0);
  #else
  outputColor = vec4(vColor, 1.0);
  #endif // BACKGROUND
}
