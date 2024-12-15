uniform vec3 sunDirection;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

in vec3 vColor;

void main() {
  #ifndef PERSPECTIVE_CAMERA
  outputColor = vec4(0.0);
  discard; // Rendering celestial objects without perspective doesn't make sense.
  #endif

  #ifdef BACKGROUND
  vec3 viewDirection = normalize(vWorldDirection);
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    vWorldPosition - vEllipsoidCenter,
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

  #include <mrt_output>
}
