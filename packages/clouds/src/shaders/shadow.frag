precision highp float;
precision highp sampler3D;
precision highp sampler2DArray;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "core/raySphereIntersection"
#include "parameters"
#include "structuredSampling"
#include "clouds"

uniform sampler2D depthBuffer;
uniform sampler2DArray historyBuffer;
uniform mat4 viewMatrix; // The main camera
uniform mat4 inverseProjectionMatrix; // The main camera
uniform mat4 inverseShadowMatrices[CASCADE_COUNT]; // Inverse view projection of the sun
uniform mat4 reprojectionMatrices[CASCADE_COUNT];
uniform float cameraNear;
uniform float cameraFar;
uniform sampler3D stbnTexture;

// Raymarch to clouds
uniform int maxIterations;
uniform float minStepSize;
uniform float maxStepSize;
uniform float minDensity;
uniform float minTransmittance;

in vec2 vUv;
in mat4 vViewProjectionMatrix; // The main camera

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];
// Redundant notation for prettier.
#if CASCADE_COUNT == 1
layout(location = 1) out vec4 outputVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 2
layout(location = 2) out vec4 outputVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 3
layout(location = 3) out vec4 outputVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 4
layout(location = 4) out vec4 outputVelocity[CASCADE_COUNT];
#endif // CASCADE_COUNT

vec3 getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  // x: scalar, yz: vec2
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).xyz;
}

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture(depthBuffer, uv));
  #else
  return texture(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif
}

bool intersectsSceneObjects(const vec3 rayPosition) {
  // Ray position is relative to the ellipsoid center.
  vec3 position = rayPosition + ellipsoidCenter;

  vec4 clip = vViewProjectionMatrix * vec4(position, 1.0);
  clip /= clip.w;
  if (
    clip.x < -1.0 ||
    clip.x > 1.0 ||
    clip.y < -1.0 ||
    clip.y > 1.0 ||
    clip.z < 0.0 ||
    clip.z > 1.0
  ) {
    return false; // Ignore outside of the main camera's clip space.
  }
  vec2 uv = clip.xy * 0.5 + 0.5;
  float depth = readDepth(uv);
  if (depth >= 1.0 - 1e-7) {
    return false; // Ignore depth at an infinite distance.
  }
  // Derive the view coordinate at the depth.
  vec4 ndc = vec4(clip.xy, depth * 2.0 - 1.0, 1.0);
  vec4 sceneView = inverseProjectionMatrix * ndc;
  sceneView /= sceneView.w;

  // The ray is behind the scene objects when rayView.z < sceneView.z.
  vec4 rayView = viewMatrix * vec4(position, 1.0);
  rayView /= rayView.w;
  return rayView.z < sceneView.z;
}

vec4 marchToClouds(
  const vec3 rayOrigin, // Relative to the ellipsoid center
  const vec3 rayDirection,
  const float maxRayDistance,
  const float jitter,
  const float mipLevel
) {
  // Setup structured volume sampling.
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

  rayDistance -= stepSize * jitter;

  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float transmittanceIntegral = 1.0;
  float frontDepth = 0.0;

  int sampleCount = 0;
  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayOrigin + rayDistance * rayDirection;

    // Sample a rough density.
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (
      any(greaterThan(weather.density, vec4(minDensity))) &&
      // Skip the ray inside scene objects.
      !intersectsSceneObjects(position)
    ) {
      // Sample a detailed density.
      float density = sampleShape(weather, position, mipLevel);
      if (density > minDensity) {
        density *= 2.0; // TODO: Parametrize
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
  const vec3 viewPosition,
  const vec3 rayDirection,
  out float rayNear,
  out float rayFar
) {
  rayNear = max(
    0.0,
    raySphereFirstIntersection(
      viewPosition,
      rayDirection,
      ellipsoidCenter,
      bottomRadius + maxLayerHeights.x
    )
  );
  rayFar = raySphereFirstIntersection(
    viewPosition,
    rayDirection,
    ellipsoidCenter,
    bottomRadius + minLayerHeights.x
  );
  if (rayFar < 0.0) {
    rayFar = 1e6;
  }
}

void cascade(const int index, const float mipLevel, out vec4 outputColor, out vec4 outputVelocity) {
  vec2 clip = vUv * 2.0 - 1.0;
  vec4 point = inverseShadowMatrices[index] * vec4(clip.xy, -1.0, 1.0);
  point /= point.w;
  vec3 sunPosition = point.xyz;

  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);

  vec3 rayOrigin = sunPosition - ellipsoidCenter + rayNear * rayDirection;
  vec3 stbn = getSTBN();
  vec4 color = marchToClouds(rayOrigin, rayDirection, rayFar - rayNear, stbn.x, mipLevel);

  // Velocity for temporal resolution.
  vec3 frontPosition = rayOrigin + color.x * rayDirection;
  vec4 prevClip = reprojectionMatrices[index] * vec4(ellipsoidCenter + frontPosition, 1.0);
  prevClip /= prevClip.w;
  vec2 prevUv = prevClip.xy * 0.5 + 0.5;
  vec2 velocity = vUv - prevUv;

  outputColor = color;
  outputVelocity = vec4(velocity, 0.0, 1.0);
}

// TODO: Calculate from the main camera frustum perhaps?
const float mipLevels[4] = float[4](0.0, 0.5, 1.0, 2.0);

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, mipLevels[i], outputColor[i], outputVelocity[i]);
    #endif // UNROLLED_LOOP_INDEX < LAYER_COUNT
  }
  #pragma unroll_loop_end
}
