precision highp float;
precision highp sampler2DArray;

#include "varianceClipping"

uniform sampler2D colorBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D shadowLengthBuffer;
uniform sampler2D colorHistoryBuffer;
uniform sampler2D shadowLengthHistoryBuffer;

uniform vec2 texelSize;
uniform int frame;
uniform float varianceGamma;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor;
layout(location = 1) out float outputShadowLength;

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
  vec4 currentColor = texelFetch(colorBuffer, subCoord, 0);
  vec4 currentShadowLength = vec4(texelFetch(shadowLengthBuffer, subCoord, 0).rgb, 1.0);

  int bayerValue = int(bayerIndices[coord.x % 4][coord.y % 4]);
  if (bayerValue == frame % 16) {
    // Use the texel just rendered without any accumulation, for now.
    outputColor = currentColor;
    outputShadowLength = currentShadowLength.r;
    return;
  }

  vec4 depthVelocity = getClosestFragment(subCoord);
  vec2 velocity = depthVelocity.gb * texelSize;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = currentColor;
    outputShadowLength = currentShadowLength.r;
    return; // Rejection
  }

  // Variance clipping with a large variance gamma seems to work fine for upsampling.
  // This increases ghosting, of course, but it's hard to notice on clouds.
  vec4 historyColor = texture(colorHistoryBuffer, prevUv);
  vec4 clippedColor = varianceClipping(
    colorBuffer,
    subCoord,
    currentColor,
    historyColor,
    varianceGamma
  );
  outputColor = clippedColor;

  // Sampling the shadow length history using scene depth doesn’t make much
  // sense, but deriving it properly is too hard. At least this approach
  // resolves the edges of scene objects.
  vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).rgb, 1.0);
  vec4 clippedShadowLength = varianceClipping(
    shadowLengthBuffer,
    subCoord,
    currentShadowLength,
    historyShadowLength,
    varianceGamma
  );
  outputShadowLength = clippedShadowLength.r;
}

#else // TEMPORAL_UPSCALING

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 currentColor = texelFetch(colorBuffer, coord, 0);
  vec4 currentShadowLength = vec4(texelFetch(shadowLengthBuffer, coord, 0).rgb, 1.0);

  vec4 depthVelocity = getClosestFragment(coord);
  vec2 velocity = depthVelocity.gb * texelSize;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = currentColor;
    outputShadowLength = currentShadowLength.r;
    return; // Rejection
  }

  vec4 historyColor = texture(colorHistoryBuffer, prevUv);
  vec4 clippedColor = varianceClipping(colorBuffer, coord, currentColor, historyColor);
  outputColor = mix(clippedColor, currentColor, temporalAlpha);

  vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).rgb, 1.0);
  vec4 clippedShadowLength = varianceClipping(
    shadowLengthBuffer,
    coord,
    currentShadowLength,
    historyShadowLength
  );
  outputShadowLength = mix(clippedShadowLength.r, currentShadowLength.r, temporalAlpha);
}

#endif // TEMPORAL_UPSCALING
