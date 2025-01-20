precision highp float;
precision mediump sampler2D;

uniform sampler2D colorBuffer;
uniform sampler2D shadowLengthBuffer;

layout(location = 0) out vec4 outputColor;
layout(location = 1) out float outputShadowLength;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  outputColor = texelFetch(colorBuffer, coord, 0);
  outputShadowLength = texelFetch(shadowLengthBuffer, coord, 0).r;
}
