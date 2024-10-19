uniform mat4 inverseProjectionMatrix;
uniform vec3 cameraPosition;
uniform vec3 earthCenter;

varying vec3 vWorldPosition;
varying vec3 vEarthCenter;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vEarthCenter = earthCenter * METER_TO_UNIT_LENGTH;
}
