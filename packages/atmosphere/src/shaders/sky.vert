uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 ellipsoidCenter;

layout(location = 0) in vec3 position;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vEllipsoidCenter;

void main() {
  // calculate world camera ray based on camera matrices
  vec4 nearPlane = inverseViewMatrix * inverseProjectionMatrix * vec4(position.xy, - 1.0, 1.0);
  nearPlane /= nearPlane.w;

  vec4 farPlane = inverseViewMatrix * inverseProjectionMatrix * vec4(position.xy, 1.0, 1.0);
  farPlane /= farPlane.w;

  vWorldPosition = nearPlane.xyz * METER_TO_UNIT_LENGTH;
  vWorldDirection = farPlane.xyz - nearPlane.xyz;
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;

  gl_Position = vec4(position, 1.0);
}
