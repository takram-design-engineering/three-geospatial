precision highp float;

uniform vec3 ellipsoidCenter;
uniform vec3 altitudeCorrection;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vEllipsoidCenter;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vEllipsoidCenter = ellipsoidCenter + altitudeCorrection;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
