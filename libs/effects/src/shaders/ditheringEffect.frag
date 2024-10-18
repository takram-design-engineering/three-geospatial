#define DITHERING

#include <dithering_pars_fragment>

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  outputColor = vec4(dithering(inputColor.rgb), inputColor.a);
}
