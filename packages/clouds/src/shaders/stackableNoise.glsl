// Based on: https://github.com/sebh/TileableVolumeNoise

float hash(float n) {
  return fract(sin(n + 1.951) * 43758.5453);
}

float noise(const vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);

  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + 113.0 * p.z;
  return mix(
    mix(
      mix(hash(n + 0.0), hash(n + 1.0), f.x),
      mix(hash(n + 57.0), hash(n + 58.0), f.x),
      f.y
    ),
    mix(
      mix(hash(n + 113.0), hash(n + 114.0), f.x),
      mix(hash(n + 170.0), hash(n + 171.0), f.x),
      f.y
    ),
    f.z
  );
}

float remap(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) / (max1 - min1) * (max2 - min2);
}

float createWorleyNoise(const vec3 p, const float cellCount) {
  vec3 cell = p * cellCount;
  float d = 1.0e10;
  for (int x = -1; x <= 1; ++x) {
    for (int y = -1; y <= 1; ++y) {
      for (int z = -1; z <= 1; ++z) {
        vec3 tp = floor(cell) + vec3(x, y, z);
        tp = cell - tp - noise(mod(tp, cellCount / 1.0));
        d = min(d, dot(tp, tp));
      }
    }
  }
  return clamp(d, 0.0, 1.0);
}

float createPerlinNoise(const vec3 point, float frequency, int octaveCount) {
  // Noise frequency factor between octave, forced to 2.
  const float octaveFrequencyFactor = 2.0;

  // Compute the sum for each octave.
  float sum = 0.0;
  float roughness = 0.5;
  float weightSum = 0.0;
  float weight = 1.0;
  for (int i = 0; i < octaveCount; ++i) {
    vec4 p = vec4(point.x, point.y, point.z, 0.0) * vec4(frequency);
    float value = perlin(p, vec4(frequency));
    sum += value * weight;
    weightSum += weight;
    weight *= roughness;
    frequency *= octaveFrequencyFactor;
  }

  float noise = sum / weightSum;
  return clamp(noise, 0.0, 1.0);
}
