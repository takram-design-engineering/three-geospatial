// TODO: Test logarithmic depth
float linearizeDepth(const float depth) {
  float near = cameraNear;
  float far = cameraFar;
  return 2.0 * near / (far + near - depth * (far - near));
}

// A fifth-order polynomial approximation.
// See: https://observablehq.com/@mbostock/turbo
// prettier-ignore
vec3 turbo(const float x) {
  float r = 0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375))));
  float g = 0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 - x * (4.2109 + x * 2.7747))));
  float b = 0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * (88.5066 - x * 26.8183))));
  return vec3(r, g, b);
}

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  float depth = linearizeDepth(readDepth(uv));
  #ifdef USE_TURBO
  vec3 color = turbo(1.0 - depth);
  #else
  vec3 color = vec3(depth);
  #endif
  outputColor = vec4(color, inputColor.a);
}
