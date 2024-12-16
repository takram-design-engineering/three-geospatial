uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform vec3 ellipsoidCenter;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vViewPosition;
out vec3 vViewDirection; // Direction to the center of screen
out vec3 vRayDirection; // Direction to the texels
out vec3 vEllipsoidCenter;

void main() {
  vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
  vec4 rayDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
  vViewPosition = cameraPosition;
  vViewDirection = normalize((inverseViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vRayDirection = rayDirection.xyz;
  vEllipsoidCenter = ellipsoidCenter;

  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
