precision highp float;
precision highp sampler2DArray;

#include "textureCatmullRom"
#include "varianceClipping"

uniform sampler2D inputBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D historyBuffer;

uniform mat4 reprojectionMatrix;
uniform vec2 texelSize;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor;

const ivec2 neighborOffsets[8] = ivec2[8](
  ivec2(-1, -1),
  ivec2(-1, 0),
  ivec2(-1, 1),
  ivec2(0, -1),
  ivec2(0, 1),
  ivec2(1, -1),
  ivec2(1, 0),
  ivec2(1, 1)
);

vec4 getClosestFragment(const ivec2 coord, const vec4 center) {
  vec4 result = center;
  ivec2 neighborCoord;
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 8; ++i) {
    neighborCoord = coord + neighborOffsets[i];
    neighbor = texelFetch(depthVelocityBuffer, neighborCoord, 0);
    if (neighbor.r > 0.0 && neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 current = texelFetch(inputBuffer, coord, 0);
  vec4 centerDepthVelocity = texelFetch(depthVelocityBuffer, coord, 0);
  if (centerDepthVelocity.r == 0.0) {
    outputColor = current;
    return; // Rejection
  }

  vec2 velocity = getClosestFragment(coord, centerDepthVelocity).gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = textureCatmullRom(historyBuffer, prevUv);
  vec4 clippedHistory = varianceClipping(inputBuffer, coord, current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}
