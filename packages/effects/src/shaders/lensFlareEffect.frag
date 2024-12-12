uniform sampler2D bloomBuffer;
uniform sampler2D featuresBuffer;
uniform float intensity;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  vec3 bloom = texture2D(bloomBuffer, uv).rgb;
  vec3 features = texture2D(featuresBuffer, uv).rgb;
  outputColor = vec4(inputColor.rgb + (bloom + features) * intensity, inputColor.a);
}
