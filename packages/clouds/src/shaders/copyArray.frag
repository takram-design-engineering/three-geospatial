#include <common>

#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2DArray inputBuffer;
#else // FRAMEBUFFER_PRECISION_HIGH
uniform lowp sampler2DArray inputBuffer;
#endif // FRAMEBUFFER_PRECISION_HIGH

uniform float opacity;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[LAYER_COUNT];

void mainLayer(const float layer, out vec4 outputColor) {
  vec4 texel = texture(inputBuffer, vec3(vUv, layer));
  outputColor = opacity * texel;
}

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 16; i++) {
    #if UNROLLED_LOOP_INDEX < LAYER_COUNT
    mainLayer(float(UNROLLED_LOOP_INDEX), outputColor[i]);
    #endif // UNROLLED_LOOP_INDEX < LAYER_COUNT
  }
  #pragma unroll_loop_end
}
