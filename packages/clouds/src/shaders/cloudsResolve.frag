precision highp float;

uniform sampler2D inputBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D historyBuffer;

uniform mat4 reprojectionMatrix;
uniform vec2 texelSize;
uniform vec3 cameraPosition;
uniform float temporalAlpha;

in vec2 vUv;
in vec3 vRayDirection;

layout(location = 0) out vec4 outputColor;

const vec2 neighborOffsets[8] = vec2[8](
  vec2(-1.0, -1.0),
  vec2(-1.0, 0.0),
  vec2(-1.0, 1.0),
  vec2(0.0, -1.0),
  vec2(0.0, 1.0),
  vec2(1.0, -1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

vec4 getClosestFragment(const vec2 uv, const vec4 center) {
  vec4 result = center;
  vec2 neighborUv;
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 8; ++i) {
    neighborUv = uv + neighborOffsets[i] * texelSize;
    neighbor = texture(depthVelocityBuffer, neighborUv);
    if (neighbor.r > 0.0 && neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

#define EPSILON (1e-7)

// Reference: https://github.com/playdeadgames/temporal
// TODO: Can we adapt it to the optimized version?
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec4 r = history - current;
  vec4 rMin = minColor - current;
  vec4 rMax = maxColor - current;
  if (r.x > rMax.x + EPSILON) r *= rMax.x / r.x;
  if (r.y > rMax.y + EPSILON) r *= rMax.y / r.y;
  if (r.z > rMax.z + EPSILON) r *= rMax.z / r.z;
  if (r.x < rMin.x - EPSILON) r *= rMin.x / r.x;
  if (r.y < rMin.y - EPSILON) r *= rMin.y / r.y;
  if (r.z < rMin.z - EPSILON) r *= rMin.z / r.z;
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
vec4 varianceClipping(const vec4 current, const vec4 history) {
  vec4 m1 = current;
  vec4 m2 = current * current;
  for (int i = 0; i < VARIANCE_OFFSET_COUNT; ++i) {
    vec4 texel = texture(inputBuffer, vUv + varianceOffsets[i] * texelSize);
    m1 += texel;
    m2 += texel * texel;
  }
  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  vec4 mean = m1 / N;
  vec4 sigma = sqrt(m2 / N - mean * mean);
  vec4 minColor = mean - sigma;
  vec4 maxColor = mean + sigma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

void main() {
  vec4 current = texture(inputBuffer, vUv);
  vec4 centerDepthVelocity = texture(depthVelocityBuffer, vUv);
  if (centerDepthVelocity.r == 0.0) {
    outputColor = current;
    return; // Rejection
  }

  vec2 velocity = getClosestFragment(vUv, centerDepthVelocity).gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, prevUv);
  vec4 clippedHistory = varianceClipping(current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}
