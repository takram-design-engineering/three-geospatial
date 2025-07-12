// Based on: https://github.com/pmndrs/postprocessing/blob/v6.37.4/src/materials/glsl/depth-mask.frag

precision highp float;

#include <packing>

#include "core/depth"

#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer0;
uniform highp sampler2D depthBuffer1;
#else // GL_FRAGMENT_PRECISION_HIGH
uniform mediump sampler2D depthBuffer0;
uniform mediump sampler2D depthBuffer1;
#endif // GL_FRAGMENT_PRECISION_HIGH

uniform sampler2D inputBuffer;
uniform float cameraNear;
uniform float cameraFar;
uniform bool inverted;

in vec2 vUv;

layout(location = 0) out float outputColor;

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif // PERSPECTIVE_CAMERA
}

void main() {
  vec2 depth;

  #if DEPTH_PACKING_0 == 3201
  depth.x = unpackRGBAToDepth(texture(depthBuffer0, vUv));
  #else // DEPTH_PACKING_0 == 3201
  depth.x = texture(depthBuffer0, vUv).r;
  #endif // DEPTH_PACKING_0 == 3201

  #if DEPTH_PACKING_1 == 3201
  depth.y = unpackRGBAToDepth(texture(depthBuffer1, vUv));
  #else // DEPTH_PACKING_1 == 3201
  depth.y = texture(depthBuffer1, vUv).r;
  #endif // DEPTH_PACKING_1 == 3201

  depth = reverseLogDepth(depth, cameraNear, cameraFar);

  #ifdef PERSPECTIVE_CAMERA
  depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNear, cameraFar);
  depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNear, cameraFar);
  #endif // PERSPECTIVE_CAMERA

  bool isMaxDepth = depth.x >= 1.0 - 1e-7;
  bool value = isMaxDepth || depth.x < depth.y;
  if (inverted) {
    value = !value;
  }
  outputColor = float(value);
}
