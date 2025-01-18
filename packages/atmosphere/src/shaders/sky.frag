precision highp float;
precision highp sampler3D;

#include "parameters"
#include "functions"
#include "sky"

uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;

in vec3 vCameraPosition;
in vec3 vRayDirection;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

void main() {
  outputColor.rgb = getSkyRadiance(
    vCameraPosition - vEllipsoidCenter,
    normalize(vRayDirection),
    sunDirection,
    moonDirection,
    moonAngularRadius,
    lunarRadianceScale
  );
  outputColor.a = 1.0;

  #include <mrt_output>
}
