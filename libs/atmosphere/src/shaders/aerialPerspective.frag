uniform sampler2D normalBuffer;

uniform vec3 cameraPosition;
uniform vec3 sunDirection;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb, 1.0);
}
