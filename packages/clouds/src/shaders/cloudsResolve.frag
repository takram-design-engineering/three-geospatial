precision highp float;
precision highp sampler2DArray;

#include "varianceClipping"

uniform sampler2D inputBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D historyBuffer;

uniform int frame;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor;

const ivec2 neighborOffsets[9] = ivec2[9](
  ivec2(-1, -1),
  ivec2(-1, 0),
  ivec2(-1, 1),
  ivec2(0, -1),
  ivec2(0, 0),
  ivec2(0, 1),
  ivec2(1, -1),
  ivec2(1, 0),
  ivec2(1, 1)
);

vec4 getClosestFragment(const ivec2 coord) {
  vec4 result = vec4(1e7, 0.0, 0.0, 0.0);
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 9; ++i) {
    neighbor = texelFetchOffset(depthVelocityBuffer, coord, 0, neighborOffsets[i]);
    if (neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

#ifdef TEMPORAL_UPSCALING

const mat4 bayerIndices = mat4(
  vec4(0.0, 12.0, 3.0, 15.0),
  vec4(8.0, 4.0, 11.0, 7.0),
  vec4(2.0, 14.0, 1.0, 13.0),
  vec4(10.0, 6.0, 9.0, 5.0)
);

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  ivec2 subCoord = coord / 4;
  vec4 current = texelFetch(inputBuffer, subCoord, 0);

  int bayerValue = int(bayerIndices[coord.x % 4][coord.y % 4]);
  if (bayerValue == frame % 16) {
    // Use the texel just rendered without any accumulation, for now.
    outputColor = current;
    return;
  }

  vec4 depthVelocity = getClosestFragment(subCoord);
  vec2 velocity = depthVelocity.gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  // Variance clipping with a large variance gamma seems to work fine for upsampling.
  // This increases ghosting, of course, but it's hard to notice on clouds.
  vec4 history = texture(historyBuffer, prevUv);
  vec4 clippedHistory = varianceClipping(inputBuffer, subCoord, current, history, 5.0);
  outputColor = clippedHistory;
}

#else // TEMPORAL_UPSCALING

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 current = texelFetch(inputBuffer, coord, 0);

  vec4 depthVelocity = getClosestFragment(coord);
  vec2 velocity = depthVelocity.gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, prevUv);
  vec4 clippedHistory = varianceClipping(inputBuffer, coord, current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}

#endif // TEMPORAL_UPSCALING
