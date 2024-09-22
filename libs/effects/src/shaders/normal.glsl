uniform sampler2D map;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  vec3 color = texture2D(map, uv).rgb;
  outputColor = vec4(color, inputColor.a);
}
