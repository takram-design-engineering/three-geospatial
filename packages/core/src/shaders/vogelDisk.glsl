// Reference: https://www.gamedev.net/tutorials/programming/graphics/contact-hardening-soft-shadows-made-fast-r4906/

vec2 vogelDisk(const int index, const int sampleCount, const float phi) {
  const float goldenAngle = 2.39996322972865332;
  float i = float(index);
  float r = sqrt(i + 0.5) / sqrt(float(sampleCount));
  float theta = i * goldenAngle + phi;
  return r * vec2(cos(theta), sin(theta));
}
