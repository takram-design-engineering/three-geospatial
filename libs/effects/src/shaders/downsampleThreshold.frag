#include <common>

uniform sampler2D inputBuffer;

uniform float thresholdLevel;
uniform float thresholdRange;

in vec2 vCenterUv1;
in vec2 vCenterUv2;
in vec2 vCenterUv3;
in vec2 vCenterUv4;
in vec2 vRowUv1;
in vec2 vRowUv2;
in vec2 vRowUv3;
in vec2 vRowUv4;
in vec2 vRowUv5;
in vec2 vRowUv6;
in vec2 vRowUv7;
in vec2 vRowUv8;
in vec2 vRowUv9;
in float vLogBase;

float clampToBorder(const vec2 uv) {
  return float(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0);
}

// Reference: https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
void main() {
  vec3 color = 0.125 * texture2D(inputBuffer, vec2(vRowUv5)).rgb;
  vec4 weight =
    0.03125 *
    vec4(
      clampToBorder(vRowUv1),
      clampToBorder(vRowUv3),
      clampToBorder(vRowUv7),
      clampToBorder(vRowUv9)
    );
  color += weight.x * texture2D(inputBuffer, vec2(vRowUv1)).rgb;
  color += weight.y * texture2D(inputBuffer, vec2(vRowUv3)).rgb;
  color += weight.z * texture2D(inputBuffer, vec2(vRowUv7)).rgb;
  color += weight.w * texture2D(inputBuffer, vec2(vRowUv9)).rgb;

  weight =
    0.0625 *
    vec4(
      clampToBorder(vRowUv2),
      clampToBorder(vRowUv4),
      clampToBorder(vRowUv6),
      clampToBorder(vRowUv8)
    );
  color += weight.x * texture2D(inputBuffer, vec2(vRowUv2)).rgb;
  color += weight.y * texture2D(inputBuffer, vec2(vRowUv4)).rgb;
  color += weight.z * texture2D(inputBuffer, vec2(vRowUv6)).rgb;
  color += weight.w * texture2D(inputBuffer, vec2(vRowUv8)).rgb;

  weight =
    0.125 *
    vec4(
      clampToBorder(vRowUv2),
      clampToBorder(vRowUv4),
      clampToBorder(vRowUv6),
      clampToBorder(vRowUv8)
    );
  color += weight.x * texture2D(inputBuffer, vec2(vCenterUv1)).rgb;
  color += weight.y * texture2D(inputBuffer, vec2(vCenterUv2)).rgb;
  color += weight.z * texture2D(inputBuffer, vec2(vCenterUv3)).rgb;
  color += weight.w * texture2D(inputBuffer, vec2(vCenterUv4)).rgb;

  float l = luminance(color);
  float scale = saturate(
    smoothstep(thresholdLevel, thresholdLevel + thresholdRange, l)
  );
  gl_FragColor = vec4(log(color * scale + 1.0) / vLogBase, 1.0);
}
