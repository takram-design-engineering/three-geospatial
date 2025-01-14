#ifdef VARIANCE_9_SAMPLES
#define VARIANCE_OFFSET_COUNT (8)
const vec2 varianceOffsets[8] = vec2[8](
  vec2(-1.0, -1.0),
  vec2(-1.0, 1.0),
  vec2(1.0, -1.0),
  vec2(1.0, 1.0),
  vec2(1.0, 0.0),
  vec2(0.0, -1.0),
  vec2(0.0, 1.0),
  vec2(-1.0, 0.0)
);
#else
#define VARIANCE_OFFSET_COUNT (4)
const vec2 varianceOffsets[4] = vec2[4](
  vec2(1.0, 0.0),
  vec2(0.0, -1.0),
  vec2(0.0, 1.0),
  vec2(-1.0, 0.0)
);
#endif // VARIANCE_9_SAMPLES

// Reference: https://github.com/playdeadgames/temporal
// TODO: Can we adapt it to the optimized version?
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec3 r = (history - current).rgb;
  vec3 rMin = (minColor - current).rgb;
  vec3 rMax = (maxColor - current).rgb;
  const float epsilon = 1e-7;
  if (r.r > rMax.r + epsilon) r *= rMax.r / r.r;
  if (r.g > rMax.g + epsilon) r *= rMax.g / r.g;
  if (r.b > rMax.b + epsilon) r *= rMax.b / r.b;
  if (r.r < rMin.r - epsilon) r *= rMin.r / r.r;
  if (r.g < rMin.g - epsilon) r *= rMin.g / r.g;
  if (r.b < rMin.b - epsilon) r *= rMin.b / r.b;
  return vec4(current.rgb + r, current.a);
}

#ifdef VARIANCE_USE_SAMPLER_ARRAY
#define VARIANCE_SAMPLER sampler2DArray
#define VARIANCE_SAMPLER_COORD vec3
#else
#define VARIANCE_SAMPLER sampler2D
#define VARIANCE_SAMPLER_COORD vec2
#endif // VARIANCE_USE_SAMPLER_ARRAY

// Variance clipping
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf
vec4 varianceClipping(
  const VARIANCE_SAMPLER inputBuffer,
  const VARIANCE_SAMPLER_COORD uv,
  const vec2 texelSize,
  const vec4 current,
  const vec4 history
) {
  vec4 m1 = current;
  vec4 m2 = current * current;
  VARIANCE_SAMPLER_COORD neighborUv;
  vec4 neighbor;
  for (int i = 0; i < VARIANCE_OFFSET_COUNT; ++i) {
    #ifdef VARIANCE_USE_SAMPLER_ARRAY
    neighborUv = vec3(uv.xy + varianceOffsets[i] * texelSize, uv.z);
    #else
    neighborUv = uv + varianceOffsets[i] * texelSize;
    #endif // VARIANCE_USE_SAMPLER_ARRAY
    neighbor = texture(inputBuffer, neighborUv);
    m1 += neighbor;
    m2 += neighbor * neighbor;
  }
  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  const float gamma = 1.0;
  vec4 mean = m1 / N;
  vec4 sigma = sqrt(m2 / N - mean * mean);
  vec4 minColor = mean - sigma * gamma;
  vec4 maxColor = mean + sigma * gamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}
