uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidCenter;

varying vec3 vViewPosition;
varying vec3 vViewDirection;
varying vec3 vRayDirection;
varying vec3 vEllipsoidCenter;

void mainSupport() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 rayDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  vViewPosition = cameraPosition;
  vViewDirection = normalize((inverseViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vRayDirection = rayDirection.xyz;
  vEllipsoidCenter = ellipsoidCenter;
}
