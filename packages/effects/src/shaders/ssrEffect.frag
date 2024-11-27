uniform sampler2D ssrBuffer;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  vec4 ssr = texture2D(ssrBuffer, uv);
  outputColor = vec4(mix(inputColor.rgb, ssr.rgb, ssr.a), 1.0);
}
