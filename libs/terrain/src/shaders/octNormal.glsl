vec2 signNotZero(const vec2 value) {
  return vec2(value.x >= 0.0 ? 1.0 : -1.0, value.y >= 0.0 ? 1.0 : -1.0);
}

vec3 decodeOctRange(vec2 oct, const float range) {
  if (oct.x == 0.0 && oct.y == 0.0) {
    return vec3(0.0);
  }
  vec2 v = oct / range * 2.0 - 1.0;
  vec3 w = vec3(v.x, v.y, 1.0 - abs(v.x) - abs(v.y));
  if (w.z < 0.0) {
    w.xy = (1.0 - abs(w.yx)) * signNotZero(w.xy);
  }
  return normalize(w);
}

vec3 decodeOct(float packed) {
  float v = packed / 256.0;
  float x = floor(v);
  float y = (v - x) * 256.0;
  return decodeOctRange(vec2(x, y), 255.0);
}
