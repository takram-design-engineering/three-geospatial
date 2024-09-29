uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;

layout(location = 0) in vec4 position;
out vec4 worldDirection;

void main() {
  gl_Position = position;
  vec4 viewPosition = inverseProjectionMatrix * gl_Position;
  worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
}
