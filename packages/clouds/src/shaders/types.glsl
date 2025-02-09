struct SunSkyIrradiance {
  vec3 cameraSun;
  vec3 cameraSky;
  vec3 minSun;
  vec3 minSky;
  vec3 maxSun;
  vec3 maxSky;
};

struct DensityProfile {
  vec4 expTerms;
  vec4 expScales;
  vec4 linearTerms;
  vec4 constantTerms;
};
