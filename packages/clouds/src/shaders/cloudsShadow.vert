precision highp float;

uniform mat4 projectionMatrix; // The main camera
uniform mat4 viewMatrix; // The main camera
uniform mat4 inverseShadowMatrix; // Inverse view projection of the sun

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vSunWorldPosition;
out mat4 vViewProjectionMatrix;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vec4 point = inverseShadowMatrix * vec4(position.xy, -1.0, 1.0);
  point /= point.w;
  vSunWorldPosition = point.xyz;
  vViewProjectionMatrix = projectionMatrix * viewMatrix;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
