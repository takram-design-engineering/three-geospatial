uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 matrixWorld;
uniform vec3 cameraPosition;
uniform float cameraHeight;
uniform float cameraFar;
uniform vec3 ellipsoidRadii;
uniform vec3 ellipsoidSurface;
uniform float pointSize;
uniform vec2 magnitudeRange;
uniform float radianceScale;

layout(location = 0) in vec3 position;
layout(location = 1) in float magnitude;
layout(location = 2) in vec3 color;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vHeightAdjustment;
out vec3 vColor;

void main() {
  // Magnitude is stored between 0 to 1 within the given range.
  float m = mix(magnitudeRange.x, magnitudeRange.y, magnitude);
  vec3 v = pow(vec3(10.0), -vec3(magnitudeRange, m) / 2.5);
  vColor = vec3(radianceScale * color);
  vColor *= clamp((v.z - v.y) / (v.x - v.y), 0.0, 1.0);

  #ifdef BACKGROUND
  vec3 worldDirection = normalize(matrixWorld * vec4(position, 1.0)).xyz;
  vWorldDirection = worldDirection;
  vWorldPosition = cameraPosition * METER_TO_UNIT_LENGTH;
  vHeightAdjustment = getHeightAdjustment(
    cameraHeight,
    ellipsoidRadii,
    ellipsoidSurface
  );
  gl_Position =
    projectionMatrix *
    viewMatrix *
    vec4(cameraPosition + worldDirection * cameraFar, 1.0);
  #else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif // BACKGROUND

  gl_PointSize = pointSize;
}