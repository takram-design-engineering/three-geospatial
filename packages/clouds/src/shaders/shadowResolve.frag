precision highp float;
precision highp sampler2DArray;

#define VARIANCE_9_SAMPLES (1)
#define VARIANCE_USE_SAMPLER_ARRAY (1)

#include "textureCatmullRom"
#include "varianceClipping"

uniform sampler2DArray inputBuffer;
uniform sampler2DArray historyBuffer;

uniform mat4 reprojectionMatrices[CASCADE_COUNT];
uniform vec2 texelSize;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];

void cascade(const int index, out vec4 outputColor) {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 current = texelFetch(inputBuffer, ivec3(coord, index), 0);
  vec2 velocity = texelFetch(inputBuffer, ivec3(coord, index + CASCADE_COUNT), 0).rg;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = textureCatmullRom(historyBuffer, vec3(prevUv, float(index)));
  if (any(isnan(history))) {
    outputColor = current;
    return; // Rejection
  }
  vec4 clippedHistory = varianceClipping(inputBuffer, ivec3(coord, index), current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, outputColor[i]);
    #endif // UNROLLED_LOOP_INDEX < LAYER_COUNT
  }
  #pragma unroll_loop_end
}
