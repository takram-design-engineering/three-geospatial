precision highp float;
precision highp sampler3D;

#include <common>

#include "core/math"
#include "core/raySphereIntersection"
#include "parameters"
#include "structuredSampling"
#include "clouds"

uniform mat4 inverseShadowMatrices[CASCADE_COUNT];
uniform mat4 reprojectionMatrices[CASCADE_COUNT];
uniform sampler3D stbnTexture;

// Primary raymarch
uniform int maxIterations;
uniform float minStepSize;
uniform float maxStepSize;
uniform float minDensity;
uniform float minTransmittance;

in vec2 vUv;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];
// Redundant notation for prettier.
#if CASCADE_COUNT == 1
layout(location = 1) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 2
layout(location = 2) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 3
layout(location = 3) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 4
layout(location = 4) out vec3 outputDepthVelocity[CASCADE_COUNT];
#endif // CASCADE_COUNT

vec3 getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  // xy: vec2, z: scalar
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).xyz;
}

vec4 marchClouds(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float maxRayDistance,
  const float jitter,
  const float mipLevel
) {
  // Setup structured volume sampling (SVS).
  // While SVS introduces spatial aliasing, it is indeed temporally stable,
  // which is important for lower-resolution shadow maps where a flickering
  // single pixel can be highly noticeable.
  vec3 normal = getStructureNormal(rayDirection, jitter);
  float rayDistance;
  float stepSize;
  intersectStructuredPlanes(
    normal,
    rayOrigin,
    rayDirection,
    clamp(maxRayDistance / float(maxIterations), minStepSize, maxStepSize),
    rayDistance,
    stepSize
  );

  #ifdef TEMPORAL_JITTER
  rayDistance -= stepSize * jitter;
  #endif // TEMPORAL_JITTER

  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float transmittanceIntegral = 1.0;
  float frontDepth = 0.0;

  int sampleCount = 0;
  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;

    // Sample a rough density.
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample a detailed density.
      // Note this assumes an homogeneous medium.
      float density = sampleShape(weather, position, mipLevel);
      if (density > minDensity) {
        frontDepth = max(frontDepth, rayDistance);
        extinctionSum += density;
        maxOpticalDepth += density * stepSize;
        transmittanceIntegral *= exp(-density * stepSize);
        ++sampleCount;
      }
    }

    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }
    rayDistance += stepSize;
  }

  if (sampleCount == 0) {
    return vec4(maxRayDistance, 0.0, 0.0, 0.0);
  }
  float meanExtinction = extinctionSum / float(sampleCount);
  return vec4(frontDepth, meanExtinction, maxOpticalDepth, 1.0);
}

void getRayNearFar(
  const vec3 sunPosition,
  const vec3 rayDirection,
  out float rayNear,
  out float rayFar
) {
  rayNear = raySphereFirstIntersection(
    sunPosition,
    rayDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );
  rayNear = max(0.0, rayNear);
  rayFar = raySphereFirstIntersection(
    sunPosition,
    rayDirection,
    vec3(0.0),
    bottomRadius + shadowBottomHeight
  );
  if (rayFar < 0.0) {
    rayFar = 1e6;
  }
}

void cascade(
  const int index,
  const float mipLevel,
  out vec4 outputColor,
  out vec3 outputDepthVelocity
) {
  vec2 clip = vUv * 2.0 - 1.0;
  vec4 point = inverseShadowMatrices[index] * vec4(clip.xy, -1.0, 1.0);
  point /= point.w;
  vec3 sunPosition = mat3(inverseEllipsoidMatrix) * point.xyz - vEllipsoidCenter;

  // The sun direction is in ECEF. Since the view matrix is constructed with the
  // ellipsoid matrix already applied, there’s no need to apply the inverse
  // matrix here.
  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);

  vec3 rayOrigin = rayNear * rayDirection + sunPosition;
  vec3 stbn = getSTBN();
  vec4 color = marchClouds(rayOrigin, rayDirection, rayFar - rayNear, stbn.z, mipLevel);

  // Velocity for temporal resolution.
  vec3 frontPosition = color.x * rayDirection + rayOrigin;
  vec3 frontPositionWorld = mat3(ellipsoidMatrix) * (frontPosition + vEllipsoidCenter);
  vec4 prevClip = reprojectionMatrices[index] * vec4(frontPositionWorld, 1.0);
  prevClip /= prevClip.w;
  vec2 prevUv = prevClip.xy * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * resolution;

  outputColor = color;
  outputDepthVelocity = vec3(color.x, velocity);
}

// TODO: Calculate from the main camera frustum perhaps?
const float mipLevels[4] = float[4](0.0, 0.5, 1.0, 2.0);

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, mipLevels[i], outputColor[i], outputDepthVelocity[i]);
    #endif // UNROLLED_LOOP_INDEX < CASCADE_COUNT
  }
  #pragma unroll_loop_end
}
