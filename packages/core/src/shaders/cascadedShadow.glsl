// Reference: https://github.com/mrdoob/three.js/blob/r171/examples/jsm/csm/CSMShader.js

int getCascadeIndex(
  const float viewZ,
  const float cameraNear,
  const float shadowFar,
  const int cascadeCount,
  const vec2 intervals[4]
) {
  float depth = viewZToOrthographicDepth(viewZ, cameraNear, shadowFar);
  vec2 interval;
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    if (UNROLLED_LOOP_INDEX < cascadeCount) {
      interval = intervals[i];
      if (depth >= interval.x && depth < interval.y) {
        return UNROLLED_LOOP_INDEX;
      }
    }
  }
  #pragma unroll_loop_end
  return cascadeCount;
}

int getCascadeIndex(
  const mat4 viewMatrix,
  const vec3 worldPosition,
  const float cameraNear,
  const float shadowFar,
  const int cascadeCount,
  const vec2 intervals[4]
) {
  vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
  return getCascadeIndex(viewPosition.z, cameraNear, shadowFar, cascadeCount, intervals);
}

int getFadedCascadeIndex(
  const float viewZ,
  const float cameraNear,
  const float shadowFar,
  const int cascadeCount,
  const vec2 intervals[4],
  const float jitter
) {
  float depth = viewZToOrthographicDepth(viewZ, cameraNear, shadowFar);
  vec2 interval;
  float intervalCenter;
  float closestEdge;
  float margin;
  int nextIndex = cascadeCount;
  int prevIndex = cascadeCount;
  float alpha;

  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    if (UNROLLED_LOOP_INDEX < cascadeCount) {
      interval = intervals[i];
      intervalCenter = (interval.x + interval.y) * 0.5;
      closestEdge = depth < intervalCenter ? interval.x : interval.y;
      margin = closestEdge * closestEdge * 0.5;
      interval += margin * vec2(-0.5, 0.5);

      if (depth >= interval.x && depth < interval.y) {
        prevIndex = nextIndex;
        nextIndex = UNROLLED_LOOP_INDEX;
        alpha = saturate(min(depth - interval.x, interval.y - depth) / margin);
      }
    }
  }
  #pragma unroll_loop_end

  return jitter <= alpha
    ? nextIndex
    : prevIndex;
}

int getFadedCascadeIndex(
  const mat4 viewMatrix,
  const vec3 worldPosition,
  const float cameraNear,
  const float shadowFar,
  const int cascadeCount,
  const vec2 intervals[4],
  const float jitter
) {
  vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
  return getFadedCascadeIndex(
    viewPosition.z,
    cameraNear,
    shadowFar,
    cascadeCount,
    intervals,
    jitter
  );
}

int extendLastCascade(const int cascadeIndex, const int cascadeCount) {
  return min(cascadeIndex, cascadeCount - 1);
}
