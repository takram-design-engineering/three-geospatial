precision highp float;
precision highp sampler3D;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "parameters"
#include "clouds"

uniform sampler3D blueNoiseTexture;

// Raymarch to clouds
uniform int maxIterations;
uniform float initialStepSize;
uniform float maxStepSize;
uniform float minDensity;
uniform float minTransmittance;

in vec2 vUv;
in vec3 vViewPosition;

layout(location = 0) out vec3 outputColor;

float blueNoise(const vec2 uv) {
  return texture(
    blueNoiseTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      0.0 //float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).x;
}

vec3 marchToClouds(
  const vec3 viewPosition,
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float jitter,
  const float maxRayDistance
) {
  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  float stepSize = initialStepSize;
  float rayDistance = stepSize * jitter;

  int sampleCount = 0;
  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayOrigin + rayDirection * rayDistance;

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

  // TODO: Setting 0 when no sample produces soft dark edges, maxRayDistance
  // instead produces too sharp shadow edges. Maybe do the latter and dilate it
  // before blurring.
  float frontDepth =
    transmittanceSum > 0.0
      ? weightedDistanceSum / transmittanceSum
      : maxRayDistance;
  float meanExtinction = sampleCount > 0 ? extinctionSum / float(sampleCount) : 0.0;
  return vec3(frontDepth, meanExtinction, maxOpticalDepth);
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

void main() {
  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(vViewPosition, rayDirection, rayNear, rayFar);
  if (rayNear < 0.0) {
    discard;
  }

  // TODO: Clamp the ray at the scene objects.
  // This can't afford another depth render pass, so that take projection
  // transform of the main camera and measure the position from it. It will
  // result in incorrect shadow outside of the main view.

  vec3 camera = vViewPosition - ellipsoidCenter;
  vec3 rayOrigin = camera + rayNear * rayDirection;
  float jitter = blueNoise(vUv);
  outputColor = marchToClouds(camera, rayOrigin, rayDirection, jitter, rayFar - rayNear);
}
