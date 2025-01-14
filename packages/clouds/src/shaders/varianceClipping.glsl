#ifdef VARIANCE_9_SAMPLES
#define VARIANCE_OFFSET_COUNT (8)
const ivec2 varianceOffsets[8] = ivec2[8](
  ivec2(-1, -1),
  ivec2(-1, 1),
  ivec2(1, -1),
  ivec2(1, 1),
  ivec2(1, 0),
  ivec2(0, -1),
  ivec2(0, 1),
  ivec2(-1, 0)
);
#else
#define VARIANCE_OFFSET_COUNT (4)
const ivec2 varianceOffsets[4] = ivec2[4](ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0));
#endif // VARIANCE_9_SAMPLES

// Reference: https://github.com/playdeadgames/temporal
// TODO: Can we adapt it to the optimized version?
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec4 r = history - current;
  vec4 rMin = minColor - current;
  vec4 rMax = maxColor - current;
  const float epsilon = 1e-7;
  if (r.r > rMax.r + epsilon) r *= rMax.r / r.r;
  if (r.g > rMax.g + epsilon) r *= rMax.g / r.g;
  if (r.b > rMax.b + epsilon) r *= rMax.b / r.b;
  if (r.a > rMax.a + epsilon) r *= rMax.a / r.a;
  if (r.r < rMin.r - epsilon) r *= rMin.r / r.r;
  if (r.g < rMin.g - epsilon) r *= rMin.g / r.g;
  if (r.b < rMin.b - epsilon) r *= rMin.b / r.b;
  if (r.a < rMin.a - epsilon) r *= rMin.a / r.a;
  return current + r;
}

#ifdef VARIANCE_USE_SAMPLER_ARRAY
#define VARIANCE_SAMPLER sampler2DArray
#define VARIANCE_SAMPLER_COORD ivec3
#else
#define VARIANCE_SAMPLER sampler2D
#define VARIANCE_SAMPLER_COORD ivec2
#endif // VARIANCE_USE_SAMPLER_ARRAY

// Variance clipping
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf
vec4 varianceClipping(
  const VARIANCE_SAMPLER inputBuffer,
  const VARIANCE_SAMPLER_COORD coord,
  const vec4 current,
  const vec4 history,
  const float gamma
) {
  vec4 moment1 = current;
  vec4 moment2 = current * current;
  VARIANCE_SAMPLER_COORD neighborCoord;
  vec4 neighbor;
  for (int i = 0; i < VARIANCE_OFFSET_COUNT; ++i) {
    #ifdef VARIANCE_USE_SAMPLER_ARRAY
    neighborCoord = ivec3(coord.xy + varianceOffsets[i], coord.z);
    #else
    neighborCoord = coord + varianceOffsets[i];
    #endif // VARIANCE_USE_SAMPLER_ARRAY
    neighbor = texelFetch(inputBuffer, neighborCoord, 0);
    moment1 += neighbor;
    moment2 += neighbor * neighbor;
  }
  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  vec4 mean = moment1 / N;
  vec4 variance = sqrt(moment2 / N - mean * mean);
  vec4 minColor = mean - variance * gamma;
  vec4 maxColor = mean + variance * gamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

vec4 varianceClipping(
  const VARIANCE_SAMPLER inputBuffer,
  const VARIANCE_SAMPLER_COORD coord,
  const vec4 current,
  const vec4 history
) {
  return varianceClipping(inputBuffer, coord, current, history, 1.0);
}
