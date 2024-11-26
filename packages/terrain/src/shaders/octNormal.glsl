vec2 unpackOctNormal(const float packed) {
  float v = packed / 256.0;
  float x = floor(v);
  float y = (v - x) * 256.0;
  return vec2(x, y);
}

vec2 signNotZero(const vec2 value) {
  return vec2(value.x >= 0.0 ? 1.0 : -1.0, value.y >= 0.0 ? 1.0 : -1.0);
}

vec3 decodeOctNormalRange(const vec2 value, const float range) {
  if (value.x == 0.0 && value.y == 0.0) {
    return vec3(0.0);
  }
  vec2 v = value / range * 2.0 - 1.0;
  vec3 w = vec3(v.x, v.y, 1.0 - abs(v.x) - abs(v.y));
  if (w.z < 0.0) {
    w.xy = (1.0 - abs(w.yx)) * signNotZero(w.xy);
  }
  return normalize(w);
}

// TODO: Normal seems flipped on southern hemisphere.
vec3 decodeOctNormal(const float packed) {
  return decodeOctNormalRange(unpackOctNormal(packed), 255.0);
}
