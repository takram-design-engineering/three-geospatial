uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;
uniform float cameraHeight;
uniform vec3 ellipsoidRadii;
uniform vec3 ellipsoidSurface;

layout(location = 0) in vec4 position;
out vec3 vWorldDirection;
out vec3 vWorldPosition;
out vec3 vHeightAdjustment;

void main() {
  vec4 worldPosition = modelMatrix * position;
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  vHeightAdjustment =
    getHeightAdjustment(cameraHeight, ellipsoidRadii, ellipsoidSurface) *
    METER_TO_UNIT_LENGTH;

  gl_Position = projectionMatrix * modelViewMatrix * position;
  gl_Position.z = gl_Position.w;
}
