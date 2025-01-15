#ifdef FRAMEBUFFER_PRECISION_HIGH
uniform mediump sampler2DArray inputBuffer;
#else
uniform lowp sampler2DArray inputBuffer;
#endif

uniform vec2 kernel[1];
uniform int inputChannel;

layout(location = 0) out vec4 outputColor[LAYER_COUNT];

in vec2 vOffset;
in vec2 vUv;

void mainLayer(const float layer, out vec4 outputColor) {
  vec4 color = texture(inputBuffer, vec3(vUv, layer));
  vec4 result = color * kernel[0].y;

  vec2 offset = kernel[0].x * vOffset;
  vec4 c0 = texture(inputBuffer, vec3(vUv + offset, layer));
  vec4 c1 = texture(inputBuffer, vec3(vUv - offset, layer));
  result += (c0 + c1) * kernel[0].y;

  // Store the filtered input channel to alpha.
  outputColor = vec4(color.rgb, result[inputChannel]);
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
