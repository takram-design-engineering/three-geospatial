precision highp float;
precision highp sampler3D;

#include "atmosphere/parameters"
#include "atmosphere/functions"

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
struct SunSkyIrradiance {
  vec3 lowSky;
  vec3 lowSun;
  vec3 highSky;
  vec3 highSun;
};
out SunSkyIrradiance vSunSkyIrradiance;
#endif // !defined(ACCURATE_SUN_SKY_IRRADIANCE)

#ifndef ACCURATE_SUN_SKY_IRRADIANCE
SunSkyIrradiance sampleSunSkyIrradiance(const vec3 positionECEF) {
  vec3 surfaceNormal = normalize(positionECEF);
  vec2 radius = (bottomRadius + vec2(minHeight, maxHeight)) * METER_TO_LENGTH_UNIT;
  vec3 lowPosition = surfaceNormal * radius.x;
  vec3 highPosition = surfaceNormal * radius.y;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(lowPosition, sunDirection, skyIrradiance);
  SunSkyIrradiance result;
  result.lowSky = skyIrradiance;
  result.lowSun = sunIrradiance;
  sunIrradiance = GetSunAndSkyIrradiance(highPosition, sunDirection, skyIrradiance);
  result.highSky = skyIrradiance;
  result.highSun = sunIrradiance;
  return result;
}
#endif // ACCURATE_SUN_SKY_IRRADIANCE

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
