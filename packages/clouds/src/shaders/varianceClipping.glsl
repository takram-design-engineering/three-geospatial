// Reference: https://github.com/playdeadgames/temporal
// TODO: Can we adapt it to the optimized version?
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec4 r = history - current;
  vec4 rMin = minColor - current;
  vec4 rMax = maxColor - current;
  const float epsilon = 1e-7;
  if (r.x > rMax.x + epsilon) r *= rMax.x / r.x;
  if (r.y > rMax.y + epsilon) r *= rMax.y / r.y;
  if (r.z > rMax.z + epsilon) r *= rMax.z / r.z;
  if (r.x < rMin.x - epsilon) r *= rMin.x / r.x;
  if (r.y < rMin.y - epsilon) r *= rMin.y / r.y;
  if (r.z < rMin.z - epsilon) r *= rMin.z / r.z;
  return current + r;
}

#define VARIANCE_OFFSET_COUNT (4)

const vec2 varianceOffsets[4] = vec2[4](
  vec2(1.0, 0.0),
  vec2(0.0, -1.0),
  vec2(0.0, 1.0),
  vec2(-1.0, 0.0)
);

// Variance clipping
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf

vec4 varianceClipping(
  const sampler2D inputBuffer,
  const vec2 uv,
  const vec2 texelSize,
  const vec4 current,
  const vec4 history
) {
  vec4 m1 = current;
  vec4 m2 = current * current;
  for (int i = 0; i < VARIANCE_OFFSET_COUNT; ++i) {
    vec4 texel = texture(inputBuffer, uv + varianceOffsets[i] * texelSize);
    m1 += texel;
    m2 += texel * texel;
  }
  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  const float gamma = 1.0;
  vec4 mean = m1 / N;
  vec4 sigma = sqrt(m2 / N - mean * mean);
  vec4 minColor = mean - sigma * gamma;
  vec4 maxColor = mean + sigma * gamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

vec4 varianceClipping(
  const sampler2DArray inputBuffer,
  const vec3 uvw,
  const vec2 texelSize,
  const vec4 current,
  const vec4 history
) {
  vec4 m1 = current;
  vec4 m2 = current * current;
  for (int i = 0; i < VARIANCE_OFFSET_COUNT; ++i) {
    vec4 texel = texture(inputBuffer, vec3(uvw.xy + varianceOffsets[i] * texelSize, uvw.z));
    m1 += texel;
    m2 += texel * texel;
  }
  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  const float gamma = 1.0;
  vec4 mean = m1 / N;
  vec4 sigma = sqrt(m2 / N - mean * mean);
  vec4 minColor = mean - sigma * gamma;
  vec4 maxColor = mean + sigma * gamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}
