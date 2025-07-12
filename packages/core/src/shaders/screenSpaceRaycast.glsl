// Based on: https://github.com/kode80/kode80SSR/blob/master/Assets/Resources/Shaders/SSR.shader
// which is based on: http://casual-effects.blogspot.com/2014/08/screen-space-ray-tracing.html
// Requires:
//   - cameraNear
//   - cameraFar
//   - readDepth()
//   - reverseLogDepth()
//   - getViewZ()

/**
 * Copyright (c) 2015, Ben Hopkins (kode80)
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
 * THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
 * OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#ifndef SSR_MAX_ITERATIONS
#define SSR_MAX_ITERATIONS 1000
#endif // SSR_MAX_ITERATIONS

#ifndef SSR_MAX_BINARY_SEARCH_ITERATIONS
#define SSR_MAX_BINARY_SEARCH_ITERATIONS 64
#endif // SSR_MAX_BINARY_SEARCH_ITERATIONS

struct ScreenSpaceRaycastOptions {
  int iterations;
  int binarySearchIterations;
  float thickness;
  float stepSize; // In pixels
  float minStepSize; // In pixels
  // The step size will be "minStepSize" for the ray starting at this distance.
  float minStepSizeDistance;
  float maxRayDistance;
};

const ScreenSpaceRaycastOptions defaultScreenSpaceRaycastOptions = ScreenSpaceRaycastOptions(
  100, // iterations
  4, // binarySearchIterations
  100.0, // thickness
  20.0, // stepSize
  2.0, // minStepSize
  5000.0, // minStepSizeDistance
  10000.0 // maxRayDistance
);

bool rayIntersectsDepth(float zA, float zB, const vec2 uv, const float thickness) {
  if (zA > zB) {
    float tmp = zA;
    zA = zB;
    zB = tmp;
  }
  float depth = readDepth(uv);
  #ifdef USE_LOGDEPTHBUF
  depth = reverseLogDepth(depth, cameraNear, cameraFar);
  #endif // USE_LOGDEPTHBUF
  float sceneZ = getViewZ(depth);
  return zA < sceneZ && zB > sceneZ - thickness;
}

bool screenSpaceRaycast(
  const ScreenSpaceRaycastOptions options,
  const vec3 rayOrigin, // In view space
  const vec3 rayDirection, // In view space
  const mat4 projectionMatrix,
  const vec2 texelSize,
  const float jitter,
  out vec2 hitUv, // In UV
  out vec3 hitPosition, // In view space
  out float rayLength,
  out int iterationCount
) {
  // Clip the ray to the near plane.
  rayLength =
    rayOrigin.z + rayDirection.z * options.maxRayDistance > -cameraNear
      ? (-cameraNear - rayOrigin.z) / rayDirection.z
      : options.maxRayDistance;
  vec3 rayEnd = rayOrigin + rayDirection * rayLength;

  // Project into clip space.
  vec4 H0 = projectionMatrix * vec4(rayOrigin, 1.0);
  vec4 H1 = projectionMatrix * vec4(rayEnd, 1.0);
  float k0 = 1.0 / H0.w;
  float k1 = 1.0 / H1.w;

  // The interpolated homogeneous version of the camera-space points.
  vec3 Q0 = rayOrigin * k0;
  vec3 Q1 = rayEnd * k1;

  // Screen-space endpoints.
  vec2 P0 = H0.xy * k0;
  vec2 P1 = H1.xy * k1;
  P0 = (P0 * 0.5 + 0.5) / texelSize;
  P1 = (P1 * 0.5 + 0.5) / texelSize;

  // If the line is degenerate, make it cover at least one pixel to avoid
  // handling zero-pixel extent as a special case later.
  P1 += dot(P0 - P1, P0 - P1) < 0.0001 ? 0.01 : 0.0;
  vec2 delta = P1 - P0;

  // Permute so that the primary iteration is in x to collapse all quadrant-
  // specific DDA class later.
  bool permute = false;
  if (abs(delta.x) < abs(delta.y)) {
    // This is a more-vertical line.
    permute = true;
    delta = delta.yx;
    P0 = P0.yx;
    P1 = P1.yx;
  }

  float stepDirection = sign(delta.x);
  float invDx = stepDirection / delta.x;

  // Track the derivatives of Q and K.
  vec3 dQ = (Q1 - Q0) * invDx;
  float dk = (k1 - k0) * invDx;
  vec2 dP = vec2(stepDirection, delta.y * invDx);

  // Calculate pixel stride based on distance of ray origin from camera.
  // Since perspective means distant objects will be smaller in screen space,
  // we can use this to have higher quality reflections for far away objects
  // while still using a large pixel stride for near objects (and increase
  // performance). This also helps mitigate artifacts on distance reflections
  // when we use a large pixel stride.
  float strideScaler = 1.0 - min(1.0, -rayOrigin.z / options.minStepSizeDistance);
  float stepSize = options.minStepSize + strideScaler * options.stepSize;

  // Scale derivatives by the desired pixel stride and then offset the starting
  // values by the jitter fraction.
  dP *= stepSize;
  dQ *= stepSize;
  dk *= stepSize;
  P0 += dP * jitter;
  Q0 += dQ * jitter;
  k0 += dk * jitter;

  float zA = 0.0;
  float zB = 0.0;

  // Track ray step and derivatives in a vec4 to parallelize.
  vec4 PQK = vec4(P0, Q0.z, k0);
  vec4 dPQK = vec4(dP, dQ.z, dk);

  bool intersect = false;
  int count = 0;
  for (int i = 0; i < SSR_MAX_ITERATIONS; ++i) {
    if (i >= options.iterations) {
      break;
    }
    if (intersect) {
      break;
    }

    PQK += dPQK; // Step forward
    zA = zB;
    zB = (dPQK.z * 0.5 + PQK.z) / (dPQK.w * 0.5 + PQK.w);

    hitUv = permute ? PQK.yx : PQK.xy;
    hitUv *= texelSize;
    if (hitUv.x < 0.0 || hitUv.x > 1.0 || hitUv.y < 0.0 || hitUv.y > 1.0) {
      // Need to terminate here for a screen-space shadow use.
      // TODO: Revisit this in SSR later.
      break;
    }
    intersect = rayIntersectsDepth(zA, zB, hitUv, options.thickness);

    count = i;
  }

  // Binary search refinement
  if (stepSize > options.minStepSize && intersect) {
    float originalStepSize = stepSize * 0.5;
    float stride = originalStepSize;

    PQK -= dPQK; // Step backward
    dPQK /= stepSize;
    zA = PQK.z / PQK.w;
    zB = zA;

    for (int i = 0; i < SSR_MAX_BINARY_SEARCH_ITERATIONS; ++i) {
      if (i >= options.binarySearchIterations) {
        break;
      }

      PQK += dPQK * stride; // Step forward
      zA = zB;
      zB = (dPQK.z * -0.5 + PQK.z) / (dPQK.w * -0.5 + PQK.w);

      hitUv = permute ? PQK.yx : PQK.xy;
      hitUv *= texelSize;

      originalStepSize *= 0.5;
      stride = rayIntersectsDepth(zA, zB, hitUv, options.thickness)
        ? -originalStepSize
        : originalStepSize;
    }
  }

  Q0.xy += dQ.xy * float(count);
  Q0.z = PQK.z;
  hitPosition = Q0 / PQK.w;
  rayLength *= (hitPosition.z - rayOrigin.z) / (rayEnd.z - rayOrigin.z);
  iterationCount = count;

  return intersect;
}
