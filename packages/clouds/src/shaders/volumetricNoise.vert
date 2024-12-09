in vec2 uv;
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4((uv - 0.5) * 2.0, 0.0, 1.0);
}
