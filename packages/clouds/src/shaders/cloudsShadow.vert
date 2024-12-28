precision highp float;

uniform mat4 projectionMatrix; // The main camera
uniform mat4 viewMatrix; // The main camera

layout(location = 0) in vec3 position;

out vec2 vUv;
out mat4 vViewProjectionMatrix;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vViewProjectionMatrix = projectionMatrix * viewMatrix;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
