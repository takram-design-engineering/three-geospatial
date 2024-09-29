uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;

varying vec4 worldDirection;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
}
