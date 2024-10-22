uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidCenter;

layout(location = 0) in vec3 position;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vEllipsoidCenter;

void main() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vWorldDirection = worldDirection.xyz;
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;

  gl_Position = vec4(position, 1.0);
}
