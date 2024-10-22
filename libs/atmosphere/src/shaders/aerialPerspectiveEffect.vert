uniform mat4 inverseProjectionMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidRadii;
uniform vec3 ellipsoidCenter;

varying vec3 vWorldPosition;
varying vec3 vEllipsoidCenter;
varying vec3 vEllipsoidRadiiSquared;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;
  vec3 radii = ellipsoidRadii * METER_TO_UNIT_LENGTH;
  vEllipsoidRadiiSquared = radii * radii;
}
