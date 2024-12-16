uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidCenter;

layout(location = 0) in vec3 position;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vEllipsoidCenter;

void getCameraRay(out vec3 origin, out vec3 direction) {
  bool isPerspective = inverseProjectionMatrix[2][3] != 0.0; // 4th entry in the 3rd column

  if (isPerspective) {
    // calculate the camera ray for a perspective camera
    vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
    vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
    origin = cameraPosition;
    direction = worldDirection.xyz;
  } else {
    // unprojected points to calculate direction
    vec4 nearPoint = inverseProjectionMatrix * vec4(position.xy, -1.0, 1.0);
    vec4 farPoint = inverseProjectionMatrix * vec4(position.xy, -0.9, 1.0);
    nearPoint /= nearPoint.w;
    farPoint /= farPoint.w;

    // calculate world values
    vec4 worldDirection =
      inverseViewMatrix * vec4(farPoint.xyz - nearPoint.xyz, 0.0);
    vec4 worldOrigin = inverseViewMatrix * nearPoint;

    // outputs
    direction = worldDirection.xyz;
    origin = worldOrigin.xyz;
  }
}

void main() {
  vec3 direction, origin;
  getCameraRay(origin, direction);

  vWorldPosition = origin.xyz * METER_TO_UNIT_LENGTH;
  vWorldDirection = direction.xyz;
  vEllipsoidCenter = ellipsoidCenter * METER_TO_UNIT_LENGTH;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
