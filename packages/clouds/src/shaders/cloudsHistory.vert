precision highp float;

layout(location = 0) in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
