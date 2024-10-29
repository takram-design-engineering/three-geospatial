uniform highp sampler2D geometryBuffer;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  vec4 normalPBR = texture2D(geometryBuffer, uv);

  #ifdef OUTPUT_NORMAL
  vec3 normal = unpackVec2ToNormal(texture2D(geometryBuffer, uv).xy);
  outputColor = vec4(normal * 0.5 + 0.5, inputColor.a);
  #endif

  #ifdef OUTPUT_PBR
  outputColor = vec4(vec3(normalPBR.b, normalPBR.a, 0.0), inputColor.a);
  #endif
}
