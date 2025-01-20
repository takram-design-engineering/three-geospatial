precision highp float;
precision highp sampler3D;

#define RECIPROCAL_PI (0.3183098861837907)

#include "parameters"
#include "functions"
#include "sky"

uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform vec3 groundAlbedo;

in vec3 vCameraPosition;
in vec3 vRayDirection;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

float distanceToBottomBoundary(float r, float mu, float radius) {
  if (r < radius || mu > 0.0) {
    return -1.0;
  }
  float discriminant = r * r * (mu * mu - 1.0) + radius * radius;
  return discriminant >= 0.0
    ? max(0.0, -r * mu - sqrt(discriminant))
    : -1.0;
}

void main() {
  vec3 cameraPosition = vCameraPosition - vEllipsoidCenter;
  vec3 rayDirection = normalize(vRayDirection);
  float r = length(cameraPosition);
  float mu = dot(cameraPosition, rayDirection) / r;

  float distanceToGround = distanceToBottomBoundary(r, mu, u_bottom_radius);
  if (distanceToGround >= 0.0) {
    vec3 groundPosition = rayDirection * distanceToGround + cameraPosition;
    vec3 surfaceNormal = normalize(groundPosition);
    vec3 skyIrradiance;
    vec3 sunIrradiance = GetSunAndSkyIrradiance(
      cameraPosition,
      surfaceNormal,
      sunDirection,
      skyIrradiance
    );
    vec3 transmittance;
    vec3 inscatter = GetSkyRadianceToPoint(
      cameraPosition,
      u_bottom_radius * surfaceNormal,
      0.0, // Shadow length
      sunDirection,
      transmittance
    );
    vec3 radiance = groundAlbedo * RECIPROCAL_PI * (sunIrradiance + skyIrradiance);
    outputColor.rgb = radiance * transmittance + inscatter;
  } else {
    outputColor.rgb = getSkyRadiance(
      cameraPosition,
      rayDirection,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale
    );
  }
  outputColor.a = 1.0;

  #include <mrt_output>
}
