uniform vec2 texelSize;

out vec2 vUv;
out vec2 vAspectRatio;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vAspectRatio = vec2(texelSize.x / texelSize.y, 1.0);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
