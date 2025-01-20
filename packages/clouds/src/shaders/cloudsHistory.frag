precision highp float;
precision mediump sampler2D;

uniform sampler2D colorBuffer;
#ifdef SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // SHADOW_LENGTH

layout(location = 0) out vec4 outputColor;
#ifdef SHADOW_LENGTH
layout(location = 1) out float outputShadowLength;
#endif // SHADOW_LENGTH

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  outputColor = texelFetch(colorBuffer, coord, 0);
  #ifdef SHADOW_LENGTH
  outputShadowLength = texelFetch(shadowLengthBuffer, coord, 0).r;
  #endif // SHADOW_LENGTH
}
