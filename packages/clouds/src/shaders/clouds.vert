precision highp float;
precision highp sampler3D;

#include "atmosphere/parameters"
#include "atmosphere/functions"
#include "types"

uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidCenter;
uniform mat4 inverseEllipsoidMatrix;
uniform vec3 altitudeCorrection;

// Atmosphere
uniform float bottomRadius;
uniform vec3 sunDirection;

// Cloud layers
uniform float minHeight;
uniform float maxHeight;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vCameraPosition;
out vec3 vCameraDirection; // Direction to the center of screen
out vec3 vRayDirection; // Direction to the texel
out vec3 vEllipsoidCenter;

#if !defined(ACCURATE_SUN_SKY_IRRADIANCE)

out SunSkyIrradiance vSunSkyIrradiance;

SunSkyIrradiance sampleSunSkyIrradiance(const vec3 positionECEF) {
  vec3 surfaceNormal = normalize(positionECEF);
  vec2 radii = (bottomRadius + vec2(minHeight, maxHeight)) * METER_TO_LENGTH_UNIT;
  SunSkyIrradiance result;
  result.minSun = GetSunAndSkyIrradiance(surfaceNormal * radii.x, sunDirection, result.minSky);
  result.maxSun = GetSunAndSkyIrradiance(surfaceNormal * radii.y, sunDirection, result.maxSky);
  return result;
}

#endif // !defined(ACCURATE_SUN_SKY_IRRADIANCE)

void main() {
  vUv = position.xy * 0.5 + 0.5;

  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  mat3 rotation = mat3(inverseEllipsoidMatrix);
  vCameraPosition = rotation * cameraPosition;
  vCameraDirection = rotation * normalize((inverseViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vRayDirection = rotation * worldDirection.xyz;
  vEllipsoidCenter = ellipsoidCenter + altitudeCorrection;

  #if !defined(ACCURATE_SUN_SKY_IRRADIANCE)
  vSunSkyIrradiance = sampleSunSkyIrradiance(vCameraPosition - vEllipsoidCenter);
  #endif // !defined(ACCURATE_SUN_SKY_IRRADIANCE)

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
