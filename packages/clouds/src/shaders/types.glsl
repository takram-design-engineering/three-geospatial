struct SunSkyIrradiance {
  vec3 minSky;
  vec3 minSun;
  vec3 maxSky;
  vec3 maxSun;
};

struct DensityProfiles {
  vec4 expTerm;
  vec4 expScale;
  vec4 linearTerm;
  vec4 constantTerm;
};
