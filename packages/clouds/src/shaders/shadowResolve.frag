precision highp float;
precision highp sampler2DArray;

#include "varianceClipping"

uniform sampler2DArray inputBuffer;
uniform sampler2DArray historyBuffer;

uniform mat4 reprojectionMatrices[CASCADE_COUNT];
uniform vec2 texelSize;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];

void cascade(const int index, out vec4 outputColor) {
  vec3 uvw = vec3(vUv, float(index));
  vec4 current = texture(inputBuffer, uvw);
  vec2 velocity = texture(inputBuffer, vec3(vUv, float(index + CASCADE_COUNT))).rg;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, vec3(prevUv, float(index)));
  if (any(isnan(history))) {
    outputColor = current;
    return;
  }
  vec4 clippedHistory = varianceClipping(inputBuffer, uvw, texelSize, current, history);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}

void main() {
  cascade(0, outputColor[0]);
  #if CASCADE_COUNT > 1
  cascade(1, outputColor[1]);
  #endif // CASCADE_COUNT > 1
  #if CASCADE_COUNT > 2
  cascade(2, outputColor[2]);
  #endif // CASCADE_COUNT > 2
  #if CASCADE_COUNT > 3
  cascade(3, outputColor[3]);
  #endif // CASCADE_COUNT > 3
}
