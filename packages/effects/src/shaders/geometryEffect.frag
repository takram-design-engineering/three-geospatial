#include "core/packing"

uniform sampler2D geometryBuffer;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  vec4 normalMetalnessRoughness = texture(geometryBuffer, uv);

  #ifdef OUTPUT_NORMAL
  vec3 normal = unpackVec2ToNormal(texture(geometryBuffer, uv).xy);
  outputColor = vec4(normal * 0.5 + 0.5, inputColor.a);
  #endif // OUTPUT_NORMAL

  #ifdef OUTPUT_PBR
  outputColor = vec4(
    vec3(normalMetalnessRoughness.b, normalMetalnessRoughness.a, 0.0),
    inputColor.a
  );
  #endif // OUTPUT_PBR
}
