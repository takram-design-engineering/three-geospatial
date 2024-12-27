// Not used right now. Preserved for future use.

const mat4 bayerMatrix =
  mat4(
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  ) /
  16.0;

float bayer(const vec2 uv) {
  ivec2 xy = ivec2(uv * resolution) % 4;
  return bayerMatrix[xy.y][xy.x];
}
