uniform mat4 projectionMatrixInverse;
uniform mat4 viewMatrixInverse;

layout(location = 0) in vec4 position;
out vec4 worldDirection;

void main() {
  gl_Position = position;
  vec4 viewPosition = projectionMatrixInverse * gl_Position;
  worldDirection = viewMatrixInverse * vec4(viewPosition.xyz, 0.0);
}
