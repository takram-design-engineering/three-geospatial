uniform mat4 inverseViewMatrix;
uniform mat4 inverseProjectionMatrix;
uniform vec3 cameraPosition;
uniform float cameraHeight;
uniform vec3 ellipsoidCenter;
uniform vec3 ellipsoidRadii;
uniform vec2 geometricErrorAltitudeRange;

varying vec3 vWorldPosition;
varying vec3 vEllipsoidCenter;
varying vec3 vEllipsoidRadiiSquared;

void mainSupport() {
  vec4 nearPlane = inverseViewMatrix * inverseProjectionMatrix * vec4(position.xy, - 1.0, 1.0);
  nearPlane /= nearPlane.w;

  vWorldPosition = nearPlane.xyz * METER_TO_UNIT_LENGTH;

  #ifdef CORRECT_GEOMETRIC_ERROR
  float t = smoothstep(
    geometricErrorAltitudeRange.x,
    geometricErrorAltitudeRange.y,
    cameraHeight
  );
  vEllipsoidCenter = mix(ellipsoidCenter, vec3(0.0), t) * METER_TO_UNIT_LENGTH;
  #else
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;
  #endif // CORRECT_GEOMETRIC_ERROR

  vec3 radii = ellipsoidRadii * METER_TO_UNIT_LENGTH;
  vEllipsoidRadiiSquared = radii * radii;
}
