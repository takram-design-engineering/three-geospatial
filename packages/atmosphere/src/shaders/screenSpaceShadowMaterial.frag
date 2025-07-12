precision highp float;
precision highp sampler3D;

#include <packing>

#include "core/depth"
#include "core/transform"

#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer;
#else // GL_FRAGMENT_PRECISION_HIGH
uniform mediump sampler2D depthBuffer;
#endif // GL_FRAGMENT_PRECISION_HIGH

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 viewMatrix;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 texelSize;
uniform vec3 sunDirection;
uniform sampler3D stbnTexture;
uniform int frame;

in vec2 vUv;

layout(location = 0) out vec4 outputColor;

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture(depthBuffer, uv));
  #else // DEPTH_PACKING == 3201
  return texture(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif // PERSPECTIVE_CAMERA
}

#include "core/screenSpaceRaycast"

float getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;
}

void main() {
  float depth = readDepth(vUv);
  if (depth >= 1.0 - 1e-7) {
    discard;
  }

  #ifdef USE_LOGDEPTHBUF
  depth = reverseLogDepth(depth, cameraNear, cameraFar);
  #endif // USE_LOGDEPTHBUF

  // Reconstruct position and normal in world space.
  vec3 viewPosition = screenToView(
    vUv,
    depth,
    getViewZ(depth),
    projectionMatrix,
    inverseProjectionMatrix
  );
  vec3 viewNormal;
  // #ifdef RECONSTRUCT_NORMAL
  vec3 dx = dFdx(viewPosition);
  vec3 dy = dFdy(viewPosition);
  viewNormal = normalize(cross(dx, dy));
  // #else // RECONSTRUCT_NORMAL
  // viewNormal = readNormal(vUv);
  // #endif // RECONSTRUCT_NORMAL

  vec2 hitUv;
  vec3 hitPosition;
  float rayLength;
  int iterationCount;

  const float normalBias = 0.0001;
  float stbn = getSTBN();
  bool hit = screenSpaceRaycast(
    defaultScreenSpaceRaycastOptions,
    viewPosition - viewNormal * viewPosition.z * normalBias,
    (viewMatrix * vec4(sunDirection, 0.0)).xyz,
    projectionMatrix,
    texelSize,
    stbn,
    hitUv,
    hitPosition,
    rayLength,
    iterationCount
  );

  outputColor = vec4(hit, hitUv, rayLength);
}
