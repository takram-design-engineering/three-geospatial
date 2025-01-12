precision highp float;
precision highp sampler2DArray;

#include "varianceClipping"

uniform sampler2D inputBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D historyBuffer;

uniform mat4 reprojectionMatrix;
uniform vec2 texelSize;
uniform float temporalAlpha;

in vec2 vUv;
in vec3 vRayDirection;

layout(location = 0) out vec4 outputColor;

const vec2 neighborOffsets[8] = vec2[8](
  vec2(-1.0, -1.0),
  vec2(-1.0, 0.0),
  vec2(-1.0, 1.0),
  vec2(0.0, -1.0),
  vec2(0.0, 1.0),
  vec2(1.0, -1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

vec4 getClosestFragment(const vec2 uv, const vec4 center) {
  vec4 result = center;
  vec2 neighborUv;
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 8; ++i) {
    neighborUv = uv + neighborOffsets[i] * texelSize;
    neighbor = texture(depthVelocityBuffer, neighborUv);
    if (neighbor.r > 0.0 && neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

void main() {
  vec4 current = texture(inputBuffer, vUv);
  vec4 centerDepthVelocity = texture(depthVelocityBuffer, vUv);
  if (centerDepthVelocity.r == 0.0) {
    outputColor = current;
    return; // Rejection
  }

  vec2 velocity = getClosestFragment(vUv, centerDepthVelocity).gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, prevUv);
  vec4 clippedHistory = varianceClipping(inputBuffer, vUv, texelSize, current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}
