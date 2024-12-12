const float RECIPROCAL_FOUR_PI = 0.07957747154594767;

float henyeyGreenstein(const float g, const float cosTheta) {
  float g2 = g * g;
  // prettier-ignore
  return RECIPROCAL_FOUR_PI * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

vec3 henyeyGreenstein(const vec3 g, const float cosTheta) {
  vec3 g2 = g * g;
  // prettier-ignore
  return RECIPROCAL_FOUR_PI * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, vec3(1.5)));
}

float draine(float u, float g, float a) {
  float g2 = g * g;
  // prettier-ignore
  return (1.0 - g2) * (1.0 + a * u * u) / (4.0 * (1.0 + a * (1.0 + 2.0 * g2) / 3.0) * PI * pow(1.0 + g2 - 2.0 * g * u, 1.5));
}

// Hillaire's phase function if I'm correct.
#if PHASE_FUNCTION == 0
float phaseFunction(const float cosTheta) {
  vec3 g = vec3(-0.5, 0.9, 0.0);
  vec3 weights = vec3(0.5, 0.5, 0.0);
  return dot(henyeyGreenstein(g, cosTheta), weights);
}
#endif

// Phase function used in: https://github.com/Prograda/Skybolt
#if PHASE_FUNCTION == 1
float phaseFunction(const float cosTheta) {
  vec3 g = vec3(-0.2, 0.3, 0.96);
  vec3 weights = vec3(0.5, 0.5, 0.03);
  return dot(henyeyGreenstein(g, cosTheta), weights);
}
#endif

// A numerical fit found at: https://www.shadertoy.com/view/4sjBDG
#if PHASE_FUNCTION == 2
float phaseFunction(float cosTheta) {
  float p1 = cosTheta + 0.8194068;
  vec4 exps = exp(
    vec4(-65.0, -83.70334, 7.810083, -4.552125e-12) * vec4(cosTheta, p1 * p1, cosTheta, cosTheta) +
      vec4(-55.0, 0.0, 0.0, 0.0)
  );
  vec4 weights = vec4(0.000009805233, 0.1388198, 0.002054747, 0.02600563);
  return dot(exps, weights) * 0.25;
}
#endif

// Reference: https://research.nvidia.com/labs/rtr/approximate-mie/
#if PHASE_FUNCTION == 3
float phaseFunction(float cosTheta) {
  const float gHG = 0.18702876788543576;
  const float gD = 0.5937905847209213;
  const float alpha = 27.113693722212247;
  const float weight = 0.4981594843291369;
  // prettier-ignore
  return (1.0 - weight) * henyeyGreenstein(gHG, cosTheta) + weight * draine(cosTheta, gD, alpha);
}
#endif
