uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;

layout(location = 0) in vec3 position;
out vec3 vWorldPosition;
out vec3 vWorldDirection;

void main() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  vWorldPosition = cameraPosition * METER_TO_LENGTH_UNIT;
  vWorldDirection = worldDirection.xyz;
  gl_Position = vec4(position, 1.0);
}
