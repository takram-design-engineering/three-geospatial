// Based on: https://github.com/sebh/TileableVolumeNoise

uniform float slice;
uniform float worleyFrequency;
uniform float worleyAmplitude;
uniform float worleyLacunarity;
uniform float worleyGain;
uniform int worleyOctaves;
uniform bool invertWorley;
uniform int perlinOctaves;
uniform float perlinFrequency;

in vec2 vUv;

layout(location = 0) out float outputColor;

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

float worleyNoise(const vec3 p, const float cellCount) {
  vec3 pCell = p * cellCount;
  float d = 1.0e10;
  for (int xo = -1; xo <= 1; xo++) {
    for (int yo = -1; yo <= 1; yo++) {
      for (int zo = -1; zo <= 1; zo++) {
        vec3 tp = floor(pCell) + vec3(xo, yo, zo);
        tp = pCell - tp - noise(mod(tp, cellCount / 1.0));
        d = min(d, dot(tp, tp));
      }
    }
  }
  d = min(d, 1.0);
  d = max(d, 0.0);
  return d;
}

float worleyFbm(
  const vec3 point,
  float frequency,
  float amplitude,
  const float lacunarity,
  const float gain,
  const int octaves,
  const bool invert
) {
  float noise = 0.0;
  for (int i = 0; i < worleyOctaves; ++i) {
    noise += amplitude * (1.0 - worleyNoise(point, frequency));
    frequency *= worleyLacunarity;
    amplitude *= worleyGain;
  }
  noise -= 0.2;
  if (invertWorley) {
    noise = 1.0 - noise;
  }
  return clamp(noise, 0.0, 1.0);
}

float perlinNoise(const vec3 pIn, float frequency, int octaveCount) {
  // Noise frequency factor between octaves.
  // Must be a power of two to achieve tiling noise.
  const float octaveFrequencyFactor = 2.0;

  // Compute the sum for each octave.
  float sum = 0.0;
  float roughness = 0.5;
  float weightSum = 0.0;
  float weight = 1.0;
  for (int oct = 0; oct < octaveCount; ++oct) {
    vec4 p = vec4(pIn.x, pIn.y, pIn.z, 0.0) * vec4(frequency);
    float val = perlin(p, vec4(frequency));
    sum += val * weight;
    weightSum += weight;
    weight *= roughness;
    frequency *= octaveFrequencyFactor;
  }

  weightSum *= 0.55; // Scale by fudge factor to get result within range [0, 1]
  float noise = sum / weightSum * 0.5 + 0.5;
  return clamp(noise, 0.0, 1.0);
}

void main() {
  vec3 point = vec3(vUv.x, vUv.y, slice);

  float noise = worleyFbm(
    point,
    worleyFrequency,
    worleyAmplitude,
    worleyLacunarity,
    worleyGain,
    worleyOctaves,
    invertWorley
  );

  #ifdef MODULATE_PERLIN
  float perlin = perlinNoise(point, perlinFrequency, perlinOctaves);
  noise = clamp(inverseLerp(0.5 * noise, 1.0, perlin), 0.0, 1.0);
  #endif // MODULATE_PERLIN

  outputColor = noise;
}
