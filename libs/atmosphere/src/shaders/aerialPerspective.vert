uniform mat4 inverseProjectionMatrix;
uniform vec3 cameraPosition;
uniform float cameraHeight;
uniform vec3 ellipsoidRadii;

varying vec3 vWorldPosition;
varying float vHeightAdjustment;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vHeightAdjustment =
    getHeightAdjustment(cameraHeight, ellipsoidRadii) * METER_TO_UNIT_LENGTH;
}
