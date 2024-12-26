precision highp float;

uniform mat4 inverseProjectionMatrix;
uniform mat4 viewMatrix;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vViewPosition;
out vec3 vRayDirection;
out vec3 vEllipsoidCenter;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vec4 point = inverseProjectionMatrix * vec4(position.xy, -1.0, 1.0);
  point /= point.w;
  vViewPosition = (viewMatrix * point).xyz;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
