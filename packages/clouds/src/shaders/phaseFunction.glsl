const float RECIPROCAL_PI4 = 0.07957747154594767;

float henyeyGreenstein(const float g, const float cosTheta) {
  float g2 = g * g;
  return RECIPROCAL_PI4 * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

vec3 henyeyGreenstein(const vec3 g, const float cosTheta) {
  vec3 g2 = g * g;
  return RECIPROCAL_PI4 * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, vec3(1.5)));
}

float draine(float u, float g, float a) {
  float g2 = g * g;
  return (1.0 - g2) *
  (1.0 + a * u * u) /
  (4.0 * (1.0 + a * (1.0 + 2.0 * g2) / 3.0) * PI * pow(1.0 + g2 - 2.0 * g * u, 1.5));
}

// Hillaire's phase function if I'm correct.
#if PHASE_FUNCTION == 0
float phaseFunction(const float cosTheta, const float attenuation) {
  vec3 g = vec3(-0.5, 0.9, 0.0);
  vec3 weights = vec3(0.5, 0.5, 0.0);
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}
#endif

// Phase function used in: https://github.com/Prograda/Skybolt
#if PHASE_FUNCTION == 1
float phaseFunction(const float cosTheta, const float attenuation) {
  vec3 g = vec3(-0.2, 0.3, 0.96);
  vec3 weights = vec3(0.5, 0.5, 0.03);
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}
#endif

// Reference: https://research.nvidia.com/labs/rtr/approximate-mie/
#if PHASE_FUNCTION == 2
float phaseFunction(const float cosTheta, const float attenuation) {
  const float gHG = 0.18702876788543576;
  const float gD = 0.5937905847209213;
  const float alpha = 27.113693722212247;
  const float weight = 0.4981594843291369;
  return (1.0 - weight) * henyeyGreenstein(gHG * attenuation, cosTheta) +
  weight * draine(cosTheta, gD, alpha);
}
#endif
