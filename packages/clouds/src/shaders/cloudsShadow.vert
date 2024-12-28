precision highp float;

uniform mat4 sunInverseProjectionMatrix;
uniform mat4 sunInverseViewMatrix;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vSunWorldPosition;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vec4 point = sunInverseProjectionMatrix * vec4(position.xy, -1.0, 1.0);
  point /= point.w;
  vSunWorldPosition = (sunInverseViewMatrix * point).xyz;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
