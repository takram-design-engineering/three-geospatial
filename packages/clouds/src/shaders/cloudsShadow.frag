precision highp float;
precision highp sampler3D;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "core/raySphereIntersection"
#include "parameters"
#include "structuredSampling"
#include "clouds"

uniform sampler2D depthBuffer;
uniform mat4 viewMatrix; // The main camera
uniform mat4 inverseProjectionMatrix; // The main camera
uniform mat4 inverseShadowMatrices[4]; // Inverse view projection of the sun
uniform float cameraNear;
uniform float cameraFar;
uniform sampler3D blueNoiseTexture;

// Raymarch to clouds
uniform int maxIterations;
uniform float minStepSize;
uniform float minDensity;
uniform float minTransmittance;

in vec2 vUv;
in mat4 vViewProjectionMatrix; // The main camera

layout(location = 0) out vec4 outputColor;

float blueNoise(const vec2 uv) {
  return texture(
    blueNoiseTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      0.0 // float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).x;
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
  if (clip.x < -1.0 || clip.x > 1.0 || clip.y < -1.0 || clip.y > 1.0) {
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
    max(maxRayDistance / float(maxIterations), minStepSize),
    rayDistance,
    stepSize
  );

  // May increase aliasing noise on shadows.
  // rayDistance -= stepSize * jitter;

  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float transmittanceIntegral = 1.0;
  float frontDepth = 0.0;

  int sampleCount = 0;
  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayOrigin + rayDirection * rayDistance;

    // Terminate the ray at the scene objects.
    if (intersectsSceneObjects(position)) {
      break;
    }

    // Sample a rough density.
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample a detailed density.
      float density = sampleDensityDetail(weather, position, mipLevel);
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

  float distanceToEllipsoid = raySphereFirstIntersection(
    rayOrigin + rayDirection * frontDepth,
    rayDirection,
    vec3(0.0),
    bottomRadius
  );
  float meanExtinction = extinctionSum / float(sampleCount);
  return vec4(frontDepth, meanExtinction, maxOpticalDepth, distanceToEllipsoid);
}

void getRayNearFar(
  const vec3 viewPosition,
  const vec3 rayDirection,
  out float rayNear,
  out float rayFar
) {
  rayNear = raySphereFirstIntersection(
    viewPosition,
    rayDirection,
    ellipsoidCenter,
    bottomRadius + maxLayerHeights.x
  );
  if (rayNear < 0.0) {
    return;
  }
  rayFar = raySphereFirstIntersection(
    viewPosition,
    rayDirection,
    ellipsoidCenter,
    bottomRadius + minLayerHeights.x
  );
}

vec4 cascade(const vec2 uv, const int index, const float mipLevel) {
  mat4 inverseShadowMatrix = inverseShadowMatrices[index];
  vec2 clip = uv * 2.0 - 1.0;
  vec4 point = inverseShadowMatrix * vec4(clip.xy, -1.0, 1.0);
  point /= point.w;
  vec3 sunWorldPosition = point.xyz;

  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(sunWorldPosition, rayDirection, rayNear, rayFar);
  if (rayNear < 0.0 || rayFar < 0.0) {
    return vec4(1e7, 0.0, 0.0, 0.0);
  }

  vec3 rayOrigin = sunWorldPosition - ellipsoidCenter + rayNear * rayDirection;
  float jitter = blueNoise(vUv);
  return marchToClouds(rayOrigin, rayDirection, rayFar - rayNear, jitter, mipLevel);
}

void main() {
  // TODO: Calculate mip level
  vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;
  if (vUv.y > 0.5) {
    if (vUv.x < 0.5) {
      outputColor = cascade(coord.xw, 0, 0.0);
    } else {
      outputColor = cascade(coord.zw, 1, 0.5);
    }
  } else {
    if (vUv.x < 0.5) {
      outputColor = cascade(coord.xy, 2, 1.0);
    } else {
      outputColor = cascade(coord.zy, 3, 2.0);
    }
  }
}
