uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;

varying vec3 vWorldPosition;
varying vec3 vWorldDirection;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  vWorldPosition = cameraPosition * METER_TO_LENGTH_UNIT;
  vWorldDirection = worldDirection.xyz;
}
