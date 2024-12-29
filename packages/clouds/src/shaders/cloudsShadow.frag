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
uniform float shadowFrustumRadii[4];
uniform float cameraNear;
uniform float cameraFar;
uniform sampler3D blueNoiseTexture;

// Raymarch to clouds
uniform int minIterations;
uniform int maxIterations;
uniform float minStepSize;
uniform float maxStepSize;
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
      0.0 //float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
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
  const float frustumRadius,
  const float maxRayDistance,
  const float jitter
) {
  // Setup structured volume sampling.
  vec3 normal = getStructureNormal(rayDirection, jitter);
  float rayDistance;
  float stepSize;
  intersectStructuredPlanes(
    normal,
    rayOrigin,
    rayDirection,
    clamp(maxRayDistance / float(maxIterations) * (frustumRadius * 1e-4), minStepSize, maxStepSize),
    rayDistance,
    stepSize
  );

  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

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
    float mipLevel = 0.0; // TODO
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample a detailed density.
      float density = sampleDensityDetail(weather, position, mipLevel);
      if (density > minDensity) {
        extinctionSum += density;
        maxOpticalDepth += density * stepSize;
        ++sampleCount;

        float transmittance = exp(-density * stepSize);
        transmittanceIntegral *= transmittance;

        // Use the method of the Frostbite's 5.9.1 to obtain smooth front depth.
        weightedDistanceSum += rayDistance * transmittanceIntegral;
        transmittanceSum += transmittanceIntegral;
      }

      // Take a shorter step because we've already hit the clouds.
      rayDistance += stepSize;
    } else {
      // Otherwise step longer in empty space.
      // TODO
      rayDistance += stepSize;
    }

    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }
  }

  float frontDepth = maxRayDistance;
  float distanceToEllipsoid = 0.0;
  if (transmittanceSum > 0.0) {
    frontDepth = weightedDistanceSum / transmittanceSum;
    distanceToEllipsoid = raySphereFirstIntersection(
      rayOrigin + rayDirection * frontDepth,
      rayDirection,
      vec3(0.0),
      bottomRadius
    );
  }
  float meanExtinction = sampleCount > 0 ? extinctionSum / float(sampleCount) : 0.0;
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

vec4 cascade(const vec2 uv, const int index) {
  mat4 inverseShadowMatrix = inverseShadowMatrices[index];
  vec2 clip = uv * 2.0 - 1.0;
  vec4 point = inverseShadowMatrix * vec4(clip.xy, -1.0, 1.0);
  point /= point.w;
  vec3 sunWorldPosition = point.xyz;

  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(sunWorldPosition, rayDirection, rayNear, rayFar);
  if (rayNear < 0.0) {
    discard;
  }

  vec3 rayOrigin = sunWorldPosition - ellipsoidCenter + rayNear * rayDirection;
  float jitter = blueNoise(vUv);
  float frustumRadius = shadowFrustumRadii[index];
  return marchToClouds(rayOrigin, rayDirection, frustumRadius, rayFar - rayNear, jitter);
}

void main() {
  vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;
  if (vUv.x < 0.5) {
    if (vUv.y < 0.5) {
      outputColor = cascade(coord.xy, 0);
    } else {
      outputColor = cascade(coord.xw, 1);
    }
  } else {
    if (vUv.y < 0.5) {
      outputColor = cascade(coord.zy, 2);
    } else {
      outputColor = cascade(coord.zw, 3);
    }
  }
}
