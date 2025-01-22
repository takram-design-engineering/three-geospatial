// Based on the following work with slight modifications.
// https://github.com/sebh/TileableVolumeNoise

/**
 * The MIT License (MIT)
 *
 * Copyright(c) 2017 Sébastien Hillaire
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

precision highp float;
precision highp int;

#include "core/math"
#include "perlin"
#include "tileableNoise"

uniform float layer;

in vec2 vUv;

layout(location = 0) out float outputColor;

float getPerlinWorley(const vec3 point) {
  int octaveCount = 3;
  float frequency = 8.0;
  float perlin = getPerlinNoise(point, frequency, octaveCount);
  perlin = clamp(perlin, 0.0, 1.0);

  float cellCount = 4.0;
  vec3 noise = vec3(
    1.0 - getWorleyNoise(point, cellCount * 2.0),
    1.0 - getWorleyNoise(point, cellCount * 8.0),
    1.0 - getWorleyNoise(point, cellCount * 14.0)
  );
  float fbm = dot(noise, vec3(0.625, 0.25, 0.125));
  return remap(perlin, 0.0, 1.0, fbm, 1.0);
}

float getWorleyFbm(const vec3 point) {
  float cellCount = 4.0;
  vec4 noise = vec4(
    1.0 - getWorleyNoise(point, cellCount * 2.0),
    1.0 - getWorleyNoise(point, cellCount * 4.0),
    1.0 - getWorleyNoise(point, cellCount * 8.0),
    1.0 - getWorleyNoise(point, cellCount * 16.0)
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
  float perlinWorley = getPerlinWorley(point);
  float worleyFbm = getWorleyFbm(point);
  outputColor = remap(perlinWorley, worleyFbm - 1.0, 1.0);
}
