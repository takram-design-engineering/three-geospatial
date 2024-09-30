uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;

layout(location = 0) in vec4 position;
out vec3 vWorldDirection;
out vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * position;
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);

  gl_Position = projectionMatrix * modelViewMatrix * position;
  gl_Position.z = gl_Position.w;
}
