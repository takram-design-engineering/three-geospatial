uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 ellipsoidCenter;

layout(location = 0) in vec3 position;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vEllipsoidCenter;

void main() {
  // calculate world camera ray based on camera matrices
  vec4 nearPlanePoint = inverseProjectionMatrix * vec4(position.xy, - 1.0, 1.0);
  nearPlanePoint /= nearPlanePoint.w;

  vec4 offsetPoint = inverseProjectionMatrix * vec4(position.xy, - 0.9, 1.0);
  offsetPoint /= offsetPoint.w;

  vec4 worldDirection = inverseViewMatrix * vec4( offsetPoint.xyz - nearPlanePoint.xyz, 0.0 );
  vec4 worldOrigin = inverseViewMatrix * nearPlanePoint;
  vWorldPosition = worldOrigin.xyz * METER_TO_UNIT_LENGTH;
  vWorldDirection = worldDirection.xyz;
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;

  gl_Position = vec4(position, 1.0);
}
