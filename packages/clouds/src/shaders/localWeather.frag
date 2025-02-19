precision highp float;
precision highp int;

#include "core/math"
#include "perlin"
#include "tileableNoise"

in vec2 vUv;

layout(location = 0) out vec4 outputColor;

float getWorleyFbm(
  const vec3 point,
  float frequency,
  float amplitude,
  const float lacunarity,
  const float gain,
  const int octaveCount
) {
  float noise = 0.0;
  for (int i = 0; i < octaveCount; ++i) {
    noise += amplitude * (1.0 - getWorleyNoise(point, frequency));
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return noise;
}

void main() {
  vec3 point = vec3(vUv.x, vUv.y, 0.0);

  // Mid clouds
  {
    float worley = getWorleyFbm(
      point + vec3(0.5),
      8.0, // frequency
      0.4, // amplitude
      2.0, // lacunarity
      0.95, // gain
      4 // octaveCount
    );
    worley = smoothstep(1.0, 1.4, worley);
    outputColor.g = worley;
  }

  // Low clouds
  {
    float worley = getWorleyFbm(
      point,
      16.0, // frequency
      0.4, // amplitude
      2.0, // lacunarity
      0.95, // gain
      4 // octaveCount
    );
    worley = smoothstep(0.8, 1.4, worley);
    outputColor.r = saturate(worley - outputColor.g);
  }

  // High clouds
  {
    float perlin = getPerlinNoise(
      point,
      vec3(6.0, 12.0, 1.0), // frequency
      8 // octaveCount
    );
    perlin = smoothstep(-0.5, 0.5, perlin);
    outputColor.b = perlin;
  }

  // Extra
  {
    float perlin = getPerlinNoise(
      point + vec3(-19.1, 33.4, 47.2),
      32.0, // frequency
      4 // octaveCount
    );
    perlin = smoothstep(-0.5, 0.5, perlin);
    outputColor.a = perlin;
  }

  outputColor.a = 1.0;
}
