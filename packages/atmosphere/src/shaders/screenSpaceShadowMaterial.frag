precision highp float;

#include <common>
#include <packing>

#include "core/cascadedShadow"
#include "core/depth"
#include "core/transform"

#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer;
uniform highp sampler2D normalBuffer;
uniform highp sampler3D stbnTexture;
#else // GL_FRAGMENT_PRECISION_HIGH
uniform mediump sampler2D depthBuffer;
uniform mediump sampler2D normalBuffer;
uniform mediump sampler3D stbnTexture;
#endif // GL_FRAGMENT_PRECISION_HIGH

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 viewMatrix;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 texelSize;
uniform vec3 sunDirection;
uniform int frame;

// Configurations
uniform int maxIterationCount;
uniform int maxBinarySearchIterationCount;
uniform float thickness;
uniform float stepSize;
uniform float minStepSize;
uniform float minStepSizeDistance;
uniform float maxRayDistance;
uniform float normalBias;

#ifdef HAS_SCENE_SHADOW
struct SceneShadow {
  int cascadeCount;
  vec2 intervals[4];
  float far;
};
uniform SceneShadow sceneShadow;
#endif // HAS_SCENE_SHADOW

in vec2 vUv;

layout(location = 0) out vec2 outputColor;

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

  float stbn = getSTBN();
  float viewZ = getViewZ(depth);

  #ifdef HAS_SCENE_SHADOW
  int cascadeIndex = getFadedCascadeIndex(
    viewZ,
    cameraNear,
    sceneShadow.far,
    sceneShadow.cascadeCount,
    sceneShadow.intervals,
    stbn
  );
  if (cascadeIndex < sceneShadow.cascadeCount) {
    discard;
  }
  #endif // HAS_SCENE_SHADOW

  // Reconstruct position and normal in world space.
  vec3 viewPosition = screenToView(vUv, depth, viewZ, projectionMatrix, inverseProjectionMatrix);
  vec3 viewNormal;
  #ifdef RECONSTRUCT_NORMAL
  vec3 dx = dFdx(viewPosition);
  vec3 dy = dFdy(viewPosition);
  viewNormal = normalize(cross(dx, dy));
  #else // RECONSTRUCT_NORMAL
  viewNormal = texture(normalBuffer, vUv).rgb * 2.0 - 1.0;
  #endif // RECONSTRUCT_NORMAL

  ScreenSpaceRaycastOptions options = ScreenSpaceRaycastOptions(
    maxIterationCount,
    maxBinarySearchIterationCount,
    thickness,
    stepSize,
    minStepSize,
    minStepSizeDistance,
    maxRayDistance
  );

  vec2 hitUv;
  vec3 hitPosition;
  float rayLength;
  int iterationCount;

  bool hit = screenSpaceRaycast(
    options,
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

  outputColor = vec2(hit, rayLength);
}
