precision highp float;
precision highp sampler2DArray;

#define VARIANCE_9_SAMPLES (1)
#define VARIANCE_SAMPLER_ARRAY (1)

#include "varianceClipping"

uniform sampler2DArray inputBuffer;
uniform sampler2DArray historyBuffer;

uniform vec2 texelSize;
uniform float varianceGamma;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];

void cascade(const int index, out vec4 outputColor) {
  ivec3 coord = ivec3(gl_FragCoord.xy, index);
  vec4 current = texelFetch(inputBuffer, coord, 0);
  vec4 depthVelocity = texelFetch(inputBuffer, ivec3(coord.xy, index + CASCADE_COUNT), 0);
  vec2 velocity = depthVelocity.gb * texelSize;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, vec3(prevUv, float(index)));
  vec4 clippedHistory = varianceClipping(inputBuffer, coord, current, history, varianceGamma);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, outputColor[i]);
    #endif // UNROLLED_LOOP_INDEX < CASCADE_COUNT
  }
  #pragma unroll_loop_end
}
