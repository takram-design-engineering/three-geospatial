// Based on the following work and adapted to Three.js.
// https://github.com/kode80/kode80SSR/blob/master/Assets/Resources/Shaders/SSR.shader
//
//  Copyright (c) 2015, Ben Hopkins (kode80)
//  All rights reserved.
//
//  Redistribution and use in source and binary forms, with or without modification,
//  are permitted provided that the following conditions are met:
//
//  1. Redistributions of source code must retain the above copyright notice,
//     this list of conditions and the following disclaimer.
//
//  2. Redistributions in binary form must reproduce the above copyright notice,
//     this list of conditions and the following disclaimer in the documentation
//     and/or other materials provided with the distribution.
//
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
//  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
//  MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
//  THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
//  OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
//  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
//  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

#include <common>
#include <packing>

uniform sampler2D inputBuffer;
uniform sampler2D geometryBuffer;
uniform sampler2D depthBuffer;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float cameraNear;
uniform float cameraFar;
uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;

uniform float iterations;
uniform float binarySearchIterations;
uniform float pixelZSize;
uniform float pixelStride;
uniform float pixelStrideZCutoff;
uniform float maxRayDistance;
uniform float screenEdgeFadeStart;
uniform float eyeFadeStart;
uniform float eyeFadeEnd;
uniform float jitter;
uniform float roughness;

in vec2 vUv;

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture2D(depthBuffer, uv));
  #else
  return texture2D(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getLinearDepth(vec2 screenPosition) {
  float fragCoordZ = texture2D(depthBuffer, screenPosition).x;
  float nz = cameraNear * fragCoordZ;
  return -nz / (cameraFar * (fragCoordZ - 1.0) - nz);
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif
}

vec3 readNormal(const vec2 uv) {
  return unpackVec2ToNormal(texture2D(geometryBuffer, uv).xy);
}

void swapIfBigger(inout float aa, inout float bb) {
  if (aa > bb) {
    float tmp = aa;
    aa = bb;
    bb = tmp;
  }
}

float distanceSquared(vec2 a, vec2 b) {
  a -= b;
  return dot(a, a);
}

bool rayIntersectsDepth(float zA, float zB, vec2 uv) {
  float sceneZMax = getViewZ(
    reverseLogDepth(readDepth(uv), cameraNear, cameraFar)
  );
  float sceneZMin = sceneZMax - pixelZSize;
  return zB >= sceneZMin && zA <= sceneZMax;
}

// Trace a ray in screenspace from rayOrg (in camera space) pointing in
// rayDirection (in camera space) using jitter to offset the ray based on
// (jitter * pixelStride).
// Returns true if the ray hits a pixel in the depth buffer and outputs the
// hitPixel (in UV space), the hitPoint (in camera space) and the number of
// iterations it took to get there.
//
// Based on Morgan McGuire & Mike's GLSL implementation:
// http://casual-effects.blogspot.com/2014/08/screen-space-ray-tracing.html
bool traceScreenSpaceRay(
  vec3 rayOrigin,
  vec3 rayDirection,
  float jitter,
  out vec2 hitPixel,
  out vec3 hitPoint,
  out float iterationCount
) {
  // Clip to the near plane
  float rayLength =
    rayOrigin.z + rayDirection.z * maxRayDistance > -cameraNear
      ? (-cameraNear - rayOrigin.z) / rayDirection.z
      : maxRayDistance;
  vec3 rayEnd = rayOrigin + rayDirection * rayLength;

  // Project into homogeneous clip space
  vec4 H0 = projectionMatrix * vec4(rayOrigin, 1.0);
  vec4 H1 = projectionMatrix * vec4(rayEnd, 1.0);
  float k0 = 1.0 / H0.w;
  float k1 = 1.0 / H1.w;

  // The interpolated homogeneous version of the camera-space points
  vec3 Q0 = rayOrigin * k0;
  vec3 Q1 = rayEnd * k1;

  // Screen-space endpoints
  vec2 P0 = H0.xy * k0;
  vec2 P1 = H1.xy * k1;
  P0 = (P0 * 0.5 + 0.5) * resolution;
  P1 = (P1 * 0.5 + 0.5) * resolution;

  // If the line is degenerate, make it cover at least one pixel to avoid
  // handling zero-pixel extent as a special case later.
  P1 += distanceSquared(P0, P1) < 0.0001 ? 0.01 : 0.0;
  vec2 delta = P1 - P0;

  // Permute so that the primary iteration is in x to collapse all quadrant-
  // specific DDA class later.
  bool permute = false;
  if (abs(delta.x) < abs(delta.y)) {
    // This is a more-vertical line
    permute = true;
    delta = delta.yx;
    P0 = P0.yx;
    P1 = P1.yx;
  }

  float stepDirection = sign(delta.x);
  float invdx = stepDirection / delta.x;

  // Track the derivatives of Q and K
  vec3 dQ = (Q1 - Q0) * invdx;
  float dk = (k1 - k0) * invdx;
  vec2 dP = vec2(stepDirection, delta.y * invdx);

  // Calculate pixel stride based on distance of ray origin from camera.
  // Since perspective means distant objects will be smaller in screen space,
  // we can use this to have higher quality reflections for far away objects
  // while still using a large pixel stride for near objects (and increase
  // performance). This also helps mitigate artifacts on distance reflections
  // when we use a large pixel stride.
  float strideScaler = 1.0 - min(1.0, -rayOrigin.z / pixelStrideZCutoff);
  float pixelStride = 1.0 + strideScaler * pixelStride;

  // Scale derivatives by the desired pixel stride and then offset the starting
  // values by the jitter fraction.
  dP *= pixelStride;
  dQ *= pixelStride;
  dk *= pixelStride;
  P0 += dP * jitter;
  Q0 += dQ * jitter;
  k0 += dk * jitter;

  float zA = 0.0;
  float zB = 0.0;

  // Track ray step and derivatives in a vec4 to parallelize.
  vec4 PQK = vec4(P0, Q0.z, k0);
  vec4 dPQK = vec4(dP, dQ.z, dk);
  bool intersect = false;

  float count = 0.0;
  for (int i = 0; i < MAX_ITERATIONS; ++i) {
    if (float(i) >= iterations) {
      break;
    }
    if (intersect) {
      break;
    }

    PQK += dPQK;
    zA = zB;
    zB = (dPQK.z * 0.5 + PQK.z) / (dPQK.w * 0.5 + PQK.w);
    swapIfBigger(zB, zA);

    hitPixel = permute ? PQK.yx : PQK.xy;
    hitPixel *= texelSize;
    intersect = rayIntersectsDepth(zA, zB, hitPixel);

    count = float(i);
  }

  // Binary search refinement
  if (pixelStride > 1.0 && intersect) {
    float originalStride = pixelStride * 0.5;
    float stride = originalStride;

    PQK -= dPQK;
    dPQK /= pixelStride;
    zA = PQK.z / PQK.w;
    zB = zA;

    for (int i = 0; i < MAX_BINARY_SEARCH_ITERATIONS; ++i) {
      if (float(i) >= binarySearchIterations) {
        break;
      }

      PQK += dPQK * stride;
      zA = zB;
      zB = (dPQK.z * -0.5 + PQK.z) / (dPQK.w * -0.5 + PQK.w);
      swapIfBigger(zB, zA);

      hitPixel = permute ? PQK.yx : PQK.xy;
      hitPixel *= texelSize;

      originalStride *= 0.5;
      stride = rayIntersectsDepth(zA, zB, hitPixel)
        ? -originalStride
        : originalStride;
    }
  }

  Q0.xy += dQ.xy * count;
  Q0.z = PQK.z;
  hitPoint = Q0 / PQK.w;
  iterationCount = count;

  return intersect;
}

// https://github.com/kode80/kode80SSR
float calculateAlphaForIntersection(
  bool intersect,
  float iterationCount,
  float specularStrength,
  vec2 hitPixel,
  vec3 hitPoint,
  vec3 rayOrigin,
  vec3 rayDirection
) {
  float alpha = 1.0;
  // float alpha = min(1.0, specularStrength);

  // Fade ray hits test approach the maximum iterations.
  alpha *= 1.0 - iterationCount / iterations;

  // Fade ray hits that approach the screen edge.
  float screenFade = screenEdgeFadeStart;
  vec2 hitPixelNDC = hitPixel * 2.0 - 1.0;
  float maxDistance = min(1.0, max(abs(hitPixelNDC.x), abs(hitPixelNDC.y)));
  alpha *= 1.0 - max(0.0, maxDistance - screenFade) / (1.0 - screenFade);

  // Fade ray hits base on how much they face the camera.
  float eyeFadeStart = eyeFadeStart;
  float eyeFadeEnd = eyeFadeEnd;
  swapIfBigger(eyeFadeStart, eyeFadeEnd);
  float eyeDirection = clamp(rayDirection.z, eyeFadeStart, eyeFadeEnd);
  alpha *= 1.0 - (eyeDirection - eyeFadeStart) / (eyeFadeEnd - eyeFadeStart);

  // Fade ray hits based on distance from ray origin.
  float rayDistance = distance(rayOrigin, hitPoint);
  alpha *= 1.0 - clamp(rayDistance / maxRayDistance, 0.0, 1.0);

  alpha *= intersect ? 1.0 : 0.0;

  return alpha;
}

// TODO: Use blue noise.
vec2 whiteNoise(vec3 v) {
  v = fract(v * vec3(443.897, 441.423, 0.0973));
  v += dot(v, v.yzx + 19.19);
  return fract((v.xx + v.yz) * v.zy);
}

// Source: https://github.com/tuxalin/vulkanri/blob/master/examples/pbr_ibl/shaders/importanceSampleGGX.glsl
vec3 sampleGGX(const vec3 n, const vec2 u, float roughness) {
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;

  float phi = 2.0 * PI * u.x;
  float cosTheta = sqrt((1.0 - u.y) / (1.0 + (alpha2 - 1.0) * u.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

  vec3 H;
  H.x = cos(phi) * sinTheta;
  H.y = sin(phi) * sinTheta;
  H.z = cosTheta;

  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, n));
  vec3 bitangent = cross(n, tangent);

  vec3 sampleVec = tangent * H.x + bitangent * H.y + n * H.z;
  return normalize(sampleVec);
}

void main() {
  vec4 geometry = texture2D(geometryBuffer, vUv);
  float metalness = geometry.z;
  if (metalness < 0.01) {
    return;
  }

  float depth = readDepth(vUv);
  if (depth > 0.9999) {
    return;
  }
  depth = reverseLogDepth(depth, cameraNear, cameraFar);
  float viewZ = getViewZ(depth);

  vec3 viewPosition = screenToView(
    vUv,
    depth,
    viewZ,
    projectionMatrix,
    inverseProjectionMatrix
  );
  vec3 viewNormal = readNormal(vUv);

  vec3 rayOrigin = viewPosition;
  vec3 rayDirection = reflect(normalize(rayOrigin), viewNormal);
  float scaledRoughness = geometry.w * roughness;
  if (scaledRoughness > 0.0001) {
    rayDirection = sampleGGX(
      rayDirection,
      whiteNoise(vec3(vUv, 0.0)),
      scaledRoughness
    );
  }

  vec2 uv2 = vUv * resolution;
  float c = (uv2.x + uv2.y) * 0.25;
  float jitter = mod(c, 1.0) * jitter;

  vec2 hitPixel;
  vec3 hitPoint;
  float iterationCount;

  bool intersect = traceScreenSpaceRay(
    rayOrigin,
    rayDirection,
    jitter,
    hitPixel,
    hitPoint,
    iterationCount
  );

  float alpha = calculateAlphaForIntersection(
    intersect,
    iterationCount,
    1.0,
    hitPixel,
    hitPoint,
    rayOrigin,
    rayDirection
  );

  vec3 color = texture2D(inputBuffer, hitPixel).rgb;
  gl_FragColor = vec4(color, alpha);
}
