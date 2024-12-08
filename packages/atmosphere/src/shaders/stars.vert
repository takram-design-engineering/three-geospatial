#define saturate(x) clamp(x, 0.0, 1.0)

uniform mat4 inverseViewMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 matrixWorld;
uniform float cameraFar;
uniform vec3 ellipsoidCenter;
uniform float pointSize;
uniform vec2 magnitudeRange;
uniform float radianceScale;

layout(location = 0) in vec3 position;
layout(location = 1) in float magnitude;
layout(location = 2) in vec3 color;

out vec3 vWorldPosition;
out vec3 vWorldDirection;
out vec3 vEllipsoidCenter;
out vec3 vColor;

void main() {
  // Magnitude is stored between 0 to 1 within the given range.
  float m = mix(magnitudeRange.x, magnitudeRange.y, magnitude);
  vec3 v = pow(vec3(10.0), -vec3(magnitudeRange, m) / 2.5);
  vColor = vec3(radianceScale * color);
  vColor *= saturate((v.z - v.y) / (v.x - v.y));

  #ifdef BACKGROUND

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

  gl_Position =
    projectionMatrix *
    viewMatrix *
    vec4(vWorldPosition + vWorldDirection * cameraFar, 1.0);
  #else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif // BACKGROUND

  gl_PointSize = pointSize;
}
