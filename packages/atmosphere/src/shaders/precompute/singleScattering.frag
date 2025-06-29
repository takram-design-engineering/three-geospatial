precision highp float;
precision highp sampler3D;

#include "definitions"
#include "functions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform mat3 luminanceFromRadiance;
uniform sampler2D transmittanceTexture;
uniform int layer;

layout(location = 0) out vec4 outputColor;

void main() {
  vec4 deltaRayleigh;
  vec4 deltaMie;
  vec4 scattering;
  vec4 singleMieScattering;
  ComputeSingleScatteringTexture(
    ATMOSPHERE,
    transmittanceTexture,
    vec3(gl_FragCoord.xy, float(layer) + 0.5),
    deltaRayleigh.rgb,
    deltaMie.rgb
  );
  deltaRayleigh.a = 1.0;
  deltaMie.a = 1.0;
  scattering = vec4(
    luminanceFromRadiance * deltaRayleigh.rgb,
    (luminanceFromRadiance * deltaMie.rgb).r
  );
  singleMieScattering.rgb = luminanceFromRadiance * deltaMie.rgb;
  singleMieScattering.a = 1.0;
  outputColor = OUTPUT;
}
