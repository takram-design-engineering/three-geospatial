uniform sampler2D cloudsBuffer;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  // TODO: Implement temporal up-scaling
  vec4 clouds = texture(cloudsBuffer, uv);
  outputColor.rgb = clouds.rgb + inputColor.rgb * (1.0 - clouds.a);
  outputColor.a = inputColor.a;
}
