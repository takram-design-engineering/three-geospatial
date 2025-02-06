struct SunSkyIrradiance {
  vec3 minSky;
  vec3 minSun;
  vec3 maxSky;
  vec3 maxSun;
};

struct DensityProfile {
  vec4 expTerms;
  vec4 expScales;
  vec4 linearTerms;
  vec4 constantTerms;
};
