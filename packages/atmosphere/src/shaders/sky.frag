uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

void main() {
  vec3 viewPosition = vWorldPosition - vEllipsoidCenter;
  vec3 rayDirection = normalize(vWorldDirection);

  outputColor.rgb = getSkyRadiance(
    viewPosition,
    rayDirection,
    sunDirection,
    moonDirection,
    moonAngularRadius,
    lunarRadianceScale
  );
  outputColor.a = 1.0;

  #include <mrt_output>
}
