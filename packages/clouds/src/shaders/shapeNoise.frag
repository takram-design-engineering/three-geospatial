// Based on: https://github.com/sebh/TileableVolumeNoise

uniform float layer;

in vec2 vUv;

layout(location = 0) out float outputColor;

float createPerlinWorley(const vec3 point) {
  int octaveCount = 3;
  float frequency = 8.0;
  float perlin = createPerlinNoise(point, frequency, octaveCount);

  float cellCount = 4.0;
  vec3 noise = vec3(
    1.0 - createWorleyNoise(point, cellCount * 2.0),
    1.0 - createWorleyNoise(point, cellCount * 8.0),
    1.0 - createWorleyNoise(point, cellCount * 14.0)
  );
  float fbm = dot(noise, vec3(0.625, 0.25, 0.125));
  return remap(perlin, 0.0, 1.0, fbm, 1.0);
}

float createWorleyFbm(const vec3 point) {
  float cellCount = 4.0;
  vec4 noise = vec4(
    1.0 - createWorleyNoise(point, cellCount * 2.0),
    1.0 - createWorleyNoise(point, cellCount * 4.0),
    1.0 - createWorleyNoise(point, cellCount * 8.0),
    1.0 - createWorleyNoise(point, cellCount * 16.0)
  );
  vec3 fbm = vec3(
    dot(noise.xyz, vec3(0.625, 0.25, 0.125)),
    dot(noise.yzw, vec3(0.625, 0.25, 0.125)),
    dot(noise.zw, vec2(0.75, 0.25))
  );
  return dot(fbm, vec3(0.625, 0.25, 0.125));
}

void main() {
  vec3 point = vec3(vUv.x, vUv.y, layer);
  float perlinWorley = createPerlinWorley(point);
  float worleyFbm = createWorleyFbm(point);
  // outputColor = remap(perlinWorley, 1.0 - worleyFbm, 1.0, 0.0, 1.0);
  outputColor = remap(perlinWorley, worleyFbm - 1.0, 1.0, 0.0, 1.0);
}
