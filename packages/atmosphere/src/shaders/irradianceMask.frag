// Based on: https://github.com/pmndrs/postprocessing/blob/v6.37.4/src/materials/glsl/depth-mask.frag

#include <common>
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
uniform vec2 cameraNearFar;
uniform bool inverted;

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
  #endif // PERSPECTIVE_CAMERA
}

varying vec2 vUv;

void main() {
  vec2 depth;

  #if DEPTH_PACKING_0 == 3201
  depth.x = unpackRGBAToDepth(texture2D(depthBuffer0, vUv));
  #else // DEPTH_PACKING_0 == 3201
  depth.x = reverseLogDepth(texture2D(depthBuffer0, vUv).r, cameraNearFar.x, cameraNearFar.y);
  #endif // DEPTH_PACKING_0 == 3201

  #if DEPTH_PACKING_1 == 3201
  depth.y = unpackRGBAToDepth(texture2D(depthBuffer1, vUv));
  #else // DEPTH_PACKING_1 == 3201
  depth.y = reverseLogDepth(texture2D(depthBuffer1, vUv).r, cameraNearFar.x, cameraNearFar.y);
  #endif // DEPTH_PACKING_1 == 3201

  bool isMaxDepth = depth.x == 1.0;

  #ifdef PERSPECTIVE_CAMERA
  depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNearFar.x, cameraNearFar.y);
  depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNearFar.x, cameraNearFar.y);
  #endif // PERSPECTIVE_CAMERA

  #if DEPTH_TEST_STRATEGY == 0
  // Decide based on depth test.
  bool keep = depthTest(depth.x, depth.y);

  #elif DEPTH_TEST_STRATEGY == 1
  // Always keep max depth.
  bool keep = isMaxDepth || depthTest(depth.x, depth.y);

  #else // DEPTH_TEST_STRATEGY
  // Always discard max depth.
  bool keep = !isMaxDepth && depthTest(depth.x, depth.y);

  #endif // DEPTH_TEST_STRATEGY

  if (inverted) {
    keep = !keep;
  }
  if (keep) {
    gl_FragColor = texture2D(inputBuffer, vUv);
  } else {
    discard;
  }
}
