#include <packing>

uniform highp sampler2D inputBuffer;
uniform highp sampler2D geometryBuffer;
uniform highp sampler2D depthBuffer;

uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform float cameraNear;
uniform float cameraFar;

uniform vec2 resolution;
uniform float maxDistance;
uniform float thickness;

in vec2 vUv;

vec3 readNormal(const vec2 uv) {
  return unpackVec2ToNormal(texture2D(geometryBuffer, uv).xy);
}

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture2D(depthBuffer, uv));
  #else
  return texture2D(depthBuffer, uv).r;
  #endif
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif
}

vec3 getViewPosition(const vec2 uv, const float depth, const float clipW) {
  vec4 clip = vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  clip *= clipW;
  return (inverseProjectionMatrix * clip).xyz;
}

vec3 screenToView(const vec2 uv, const float depth, const float viewZ) {
  float clipW = projectionMatrix[2][3] * viewZ + projectionMatrix[3][3];
  return getViewPosition(uv, depth, clipW);
}

vec2 viewPositionToXY(const vec3 viewPosition) {
  vec4 clip = projectionMatrix * vec4(viewPosition, 1.0);
  return (clip.xy / clip.w * 0.5 + 0.5) * resolution;
}

float pointLineDistance(vec3 point, vec3 L1, vec3 L2) {
  return length(cross(point - L1, point - L2)) / length(L2 - L1);
}

float pointPlaneDistance(vec3 point, vec3 P, vec3 N) {
  return (dot(N, point) - dot(N, P)) / sqrt(dot(N, N));
}

void main() {
  vec4 geometry = texture2D(geometryBuffer, vUv);
  float metalness = geometry.z;
  if (metalness < 0.01) {
    return;
  }

  float depth = readDepth(vUv);
  float viewZ = getViewZ(depth);
  if (-viewZ >= cameraFar) {
    return;
  }

  vec3 viewPosition = screenToView(vUv, depth, viewZ);

  vec3 viewNormal = unpackVec2ToNormal(geometry.xy);

  #ifdef PERSPECTIVE_CAMERA
  vec3 viewIncidentDir = normalize(viewPosition);
  vec3 viewReflectDir = reflect(viewIncidentDir, viewNormal);
  #else
  vec3 viewIncidentDir = vec3(0.0, 0.0, -1.0);
  vec3 viewReflectDir = reflect(viewIncidentDir, viewNormal);
  #endif

  float maxReflectRayLen = maxDistance / dot(-viewIncidentDir, viewNormal);
  // dot(a,b)==length(a)*length(b)*cos(theta) // https://www.mathsisfun.com/algebra/vectors-dot-product.html
  // if(a.isNormalized&&b.isNormalized) dot(a,b)==cos(theta)
  // maxDistance/maxReflectRayLen=cos(theta)
  // maxDistance/maxReflectRayLen==dot(a,b)
  // maxReflectRayLen==maxDistance/dot(a,b)

  vec3 d1viewPosition = viewPosition + viewReflectDir * maxReflectRayLen;
  #ifdef PERSPECTIVE_CAMERA
  if (d1viewPosition.z > -cameraNear) {
    //https://tutorial.math.lamar.edu/Classes/CalcIII/EqnsOfLines.aspx
    float t = (-cameraNear - viewPosition.z) / viewReflectDir.z;
    d1viewPosition = viewPosition + viewReflectDir * t;
  }
  #endif

  vec2 d0 = gl_FragCoord.xy;
  vec2 d1 = viewPositionToXY(d1viewPosition);

  float totalLen = length(d1 - d0);
  float xLen = d1.x - d0.x;
  float yLen = d1.y - d0.y;
  float totalStep = max(abs(xLen), abs(yLen));
  float xSpan = xLen / totalStep;
  float ySpan = yLen / totalStep;
  for (float i = 0.0; i < float(MAX_STEPS); i++) {
    if (i >= totalStep) {
      break;
    }
    vec2 xy = vec2(d0.x + i * xSpan, d0.y + i * ySpan);
    if (
      xy.x < 0.0 ||
      xy.x > resolution.x ||
      xy.y < 0.0 ||
      xy.y > resolution.y
    ) {
      break;
    }
    float s = length(xy - d0) / totalLen;
    vec2 uv = xy / resolution;

    float d = readDepth(uv);
    float vZ = getViewZ(d);
    if (-vZ >= cameraFar) {
      continue;
    }
    float cW = projectionMatrix[2][3] * vZ + projectionMatrix[3][3];
    vec3 vP = getViewPosition(uv, d, cW);

    #ifdef PERSPECTIVE_CAMERA
    // https://comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
    float recipVPZ = 1.0 / viewPosition.z;
    float viewReflectRayZ =
      1.0 / (recipVPZ + s * (1.0 / d1viewPosition.z - recipVPZ));
    #else
    float viewReflectRayZ =
      viewPosition.z + s * (d1viewPosition.z - viewPosition.z);
    #endif // PERSPECTIVE_CAMERA

    // if(viewReflectRayZ>vZ) continue; // will cause "npm run make-screenshot webgl_postprocessing_ssr" high probability hang.
    // https://github.com/mrdoob/three.js/pull/21539#issuecomment-821061164
    if (viewReflectRayZ <= vZ) {
      bool hit;
      float away = pointLineDistance(vP, viewPosition, d1viewPosition);

      float minThickness;
      vec2 xyNeighbor = xy;
      xyNeighbor.x += 1.0;
      vec2 uvNeighbor = xyNeighbor / resolution;
      vec3 vPNeighbor = getViewPosition(uvNeighbor, d, cW);
      minThickness = vPNeighbor.x - vP.x;
      minThickness *= 3.0;
      float tk = max(minThickness, thickness);

      hit = away <= tk;

      if (hit) {
        vec3 vN = readNormal(uv);
        if (dot(viewReflectDir, vN) >= 0.0) continue;
        float distance = pointPlaneDistance(vP, viewPosition, viewNormal);
        if (distance > maxDistance) break;
        // #ifdef DISTANCE_ATTENUATION
        float ratio = 1.0 - distance / maxDistance;
        float attenuation = ratio * ratio;
        float opacity = attenuation;
        // #endif
        // #ifdef FRESNEL
        float fresnelCoe = (dot(viewIncidentDir, viewReflectDir) + 1.0) / 2.0;
        opacity *= fresnelCoe;
        // #endif
        vec4 reflectColor = texture2D(inputBuffer, uv);
        gl_FragColor.xyz = reflectColor.xyz;
        gl_FragColor.a = opacity;
        break;
      }
    }
  }
}
