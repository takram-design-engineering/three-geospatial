#define RECIPROCAL_PI4 (0.07957747154594767)

uniform sampler2D depthBuffer;
uniform vec2 resolution;
uniform float cameraHeight;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 sunDirection;
uniform float bottomRadius; // TODO:
uniform sampler2D blueNoiseTexture;
uniform sampler3D stbnScalarTexture;
uniform sampler3D stbnVectorTexture;
uniform int frame;

// Cloud parameters
uniform sampler3D shapeTexture;
uniform sampler3D shapeDetailTexture;
uniform sampler2D coverageDetailTexture;
uniform float coverage;
uniform vec3 albedo;
uniform vec2 coverageDetailFrequency;
uniform float shapeFrequency;
uniform float shapeDetailFrequency;
uniform float scatterAnisotropy;
uniform float scatterSecondaryAnisotropy;
uniform float scatterAnisotropyMix;
uniform float powderScale;
uniform float powderExponent;

// Raymarch to clouds
uniform int maxIterations;
uniform float initialStepSize;
uniform float maxStepSize;
uniform float maxRayDistance;
uniform float minDensity;
uniform float minTransmittance;

in vec2 vUv;
in vec3 vViewPosition;
in vec3 vViewDirection; // Direction to the center of screen
in vec3 vRayDirection; // Direction to the texels
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;

// TODO: Cumulus, Altostratus, Cirrocumulus, Cirrus
const vec4 minLayerHeights = vec4(600.0, 4500.0, 6700.0, 0.0);
const vec4 maxLayerHeights = vec4(1200.0, 5000.0, 8000.0, 0.0);
const vec4 densityScales = vec4(0.06, 0.02, 0.001, 0.0);
const vec4 densityDetailAmounts = vec4(1.0, 0.8, 0.3, 0.0);
const vec4 coverageModulations = vec4(0.6, 0.3, 0.5, 0.0);

// TODO: Derive from minLayerHeights and maxLayerHeights
const float minHeight = 600.0;
const float maxHeight = 7000.0;

float readDepth(const vec2 uv) {
  #if DEPTH_PACKING == 3201
  return unpackRGBAToDepth(texture(depthBuffer, uv));
  #else
  return texture(depthBuffer, uv).r;
  #endif // DEPTH_PACKING == 3201
}

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif
}

float raySphereFirstIntersection(
  const vec3 origin,
  const vec3 direction,
  const vec3 center,
  const float radius
) {
  vec3 a = origin - center;
  float b = 2.0 * dot(direction, a);
  float c = dot(a, a) - radius * radius;
  float discriminant = b * b - 4.0 * c;
  return discriminant < 0.0
    ? -1.0
    : (-b - sqrt(discriminant)) * 0.5;
}

float raySphereSecondIntersection(
  const vec3 origin,
  const vec3 direction,
  const vec3 center,
  const float radius
) {
  vec3 a = origin - center;
  float b = 2.0 * dot(direction, a);
  float c = dot(a, a) - radius * radius;
  float discriminant = b * b - 4.0 * c;
  return discriminant < 0.0
    ? -1.0
    : (-b + sqrt(discriminant)) * 0.5;
}

void raySphereIntersections(
  const vec3 origin,
  const vec3 direction,
  const vec3 center,
  const float radius,
  out float intersection1,
  out float intersection2
) {
  vec3 a = origin - center;
  float b = 2.0 * dot(direction, a);
  float c = dot(a, a) - radius * radius;
  float discriminant = b * b - 4.0 * c;
  if (discriminant < 0.0) {
    intersection1 = -1.0;
    intersection2 = -1.0;
    return;
  } else {
    float Q = sqrt(discriminant);
    intersection1 = (-b - Q) * 0.5;
    intersection2 = (-b + Q) * 0.5;
  }
}

float random(const vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

float blueNoise(const vec2 uv) {
  return texture(
    stbnScalarTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).x;
}

vec3 blueNoiseVector(const vec2 uv) {
  return texture(
    stbnVectorTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).xyz;
}

const mat4 bayerMatrix =
  mat4(
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  ) /
  16.0;

float bayer(const vec2 uv) {
  ivec2 xy = ivec2(uv * resolution) % 4;
  return bayerMatrix[xy.y][xy.x];
}

vec2 getGlobeUv(const vec3 position) {
  vec2 st = normalize(position.yx);
  float phi = atan(st.x, st.y);
  float theta = asin(normalize(position).z);
  return vec2(phi * RECIPROCAL_PI2 + 0.5, theta * RECIPROCAL_PI + 0.5);
}

float getMipLevel(const vec2 uv) {
  vec2 coord = uv * resolution;
  vec2 ddx = dFdx(coord);
  vec2 ddy = dFdy(coord);
  return max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
}

struct CoverageSample {
  vec4 coverageDetail;
  vec4 heightFraction;
  vec4 heightScale;
};

vec4 shapeAlteringFunction(const vec4 heightFraction, const float bias) {
  // Apply a semi-circle transform round the clouds towards the top.
  vec4 biased = pow(heightFraction, vec4(bias));
  vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
  return vec4(1.0) - x * x;
}

CoverageSample sampleCoverage(const vec2 uv, const float height, const float mipLevel) {
  CoverageSample cs;
  cs.coverageDetail = pow(
    textureLod(coverageDetailTexture, uv * coverageDetailFrequency, mipLevel),
    // TODO: Parameterize exponents.
    vec4(1.0, 1.0, 2.0, 1.0)
  );
  cs.heightFraction = saturate(
    remap(vec4(height), minLayerHeights, maxLayerHeights, vec4(0.0), vec4(1.0))
  );
  cs.heightScale = shapeAlteringFunction(cs.heightFraction, 0.3);
  return cs;
}

vec4 sampleDensity(CoverageSample cs) {
  // TODO: Nicely decrease density at the bottom.
  vec4 inverseCoverage = 1.0 - coverage * cs.heightScale;
  return saturate(
    remap(
      cs.coverageDetail * (1.0 - coverageModulations) + coverageModulations,
      inverseCoverage,
      inverseCoverage + coverageModulations,
      vec4(0.0),
      vec4(1.0)
    )
  );
}

float sampleDensityDetail(CoverageSample cs, const vec3 position, const float mipLevel) {
  vec4 density = sampleDensity(cs);
  if (mipLevel < 2.0) {
    float shape = textureLod(shapeTexture, position * shapeFrequency, 0.0).r;
    // shape = pow(shape, 6.0) * 0.4; // Modulation for whippier shape
    shape = 1.0 - shape; // Or invert for fluffy shape
    density = mix(density, saturate(remap(density, shape, 1.0, 0.0, 1.0)), densityDetailAmounts);

    #ifdef USE_DETAIL
    if (mipLevel < 1.0) {
      float detail = textureLod(shapeDetailTexture, position * shapeDetailFrequency, 0.0).r;
      // Fluffy at the top and whippy at the bottom.
      vec4 modifier = mix(
        vec4(pow(detail, 6.0)),
        vec4(1.0 - detail),
        saturate(remap(cs.heightFraction, 0.4, 0.6, 0.0, 1.0))
      );
      modifier = mix(vec4(0.0), modifier, densityDetailAmounts);
      density = saturate(
        remap(density * 2.0, vec4(modifier * 0.5), vec4(1.0), vec4(0.0), vec4(1.0))
      );
    }
    #endif
  }
  return saturate(dot(density, densityScales * cs.heightFraction) * 5.0);
}

void applyAerialPerspective(const vec3 camera, const vec3 point, inout vec4 color) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    camera * METER_TO_UNIT_LENGTH,
    point * METER_TO_UNIT_LENGTH,
    0.0, // Shadow length
    sunDirection,
    transmittance
  );
  color.rgb = mix(color.rgb, color.rgb * transmittance + inscatter, color.a);
}

vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {
  vec2 g2 = g * g;
  return RECIPROCAL_PI4 * ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5)));
}

float phaseFunction(const float cosTheta, const float attenuation) {
  vec2 g = vec2(scatterAnisotropy, scatterSecondaryAnisotropy);
  vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}

float multipleScattering(const float opticalDepth, const float cosTheta, const float density) {
  // Attenuation, contribution and phase attenuation are all the same
  // as described in: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  vec3 coeff = vec3(1.0);
  // a, b, c, and should satisfy a <= b.
  const vec3 attenuation = vec3(0.5, 0.5, 0.8);
  float scattering = 0.0;
  for (int octave = 0; octave < MULTI_SCATTERING_OCTAVES; ++octave) {
    float beerLambert = exp(-opticalDepth * coeff.y);
    // A similar approximation is described in the Frostbite's paper, where
    // phase angle is attenuated.
    scattering += coeff.x * beerLambert * phaseFunction(cosTheta * coeff.z, coeff.z);
    coeff *= attenuation;
  }
  return scattering;
}

// Random offsets for sampling scattered lights for less bias.
// Used in several places without an explicit citation:
// https://github.com/fede-vaccaro/TerrainEngine-OpenGL
const vec3 SCATTER_OFFSETS[6] = vec3[6](
  vec3(0.114153915, 0.277360347, -0.006334035),
  vec3(-0.151877397, -0.010772376, -0.258490254),
  vec3(-0.097527654, -0.283672317, 0.004286379),
  vec3(0.027078714, -0.082129635, 0.287265495),
  vec3(0.084385794, 0.127330917, -0.258197355),
  vec3(-0.050557209, 0.044246091, 0.292380318)
);

const float SCATTER_DISTANCES[6] = float[6](1.0, 2.0, 4.0, 8.0, 16.0, 32.0);
const float SCATTER_STEP_SIZES[6] = float[6](1.0, 1.0, 2.0, 4.0, 8.0, 16.0);

// TODO: Raymarch to light for near clouds, and implement BSM for far clouds.
vec3 marchToLight(
  const vec3 rayOrigin,
  const vec3 sunDirection,
  const vec3 sunIrradiance,
  const vec3 skyIrradiance,
  const float cosTheta,
  const float density,
  const float mipLevel
) {
  const float stepLength = 10.0;
  float opticalDepth = 0.0;
  for (int i = 0; i < 6; ++i) {
    vec3 randomOffset = (sunDirection + SCATTER_OFFSETS[i] * 0.3) * SCATTER_DISTANCES[i];
    vec3 position = rayOrigin + randomOffset * stepLength;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    CoverageSample cs = sampleCoverage(uv, height, mipLevel);
    float density = sampleDensityDetail(cs, position, mipLevel);
    float stepSize = SCATTER_STEP_SIZES[i] * stepLength;
    opticalDepth += density * stepSize;
  }

  vec3 irradiance = sunIrradiance + skyIrradiance;
  float scattering = multipleScattering(opticalDepth, cosTheta, density);
  return irradiance * scattering * density;
}

vec4 marchToCloud(
  const vec3 viewPosition,
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float jitter,
  const float maxRayDistance,
  const float rayStartTexelsPerPixel,
  const vec3 sunDirection,
  vec3 sunIrradiance,
  vec3 skyIrradiance,
  out float weightedMeanDepth
) {
  vec3 radianceIntegral = vec3(0.0);
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  float stepSize = initialStepSize;
  float rayDistance = stepSize * jitter;
  float cosTheta = dot(sunDirection, rayDirection);

  for (int i = 0; i < maxIterations; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }

    vec3 position = rayOrigin + rayDirection * rayDistance;

    // Sample a rough density.
    float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance / 1e5));
    float height = length(position) - bottomRadius;
    vec2 uv = getGlobeUv(position);
    CoverageSample cs = sampleCoverage(uv, height, mipLevel);
    vec4 density = sampleDensity(cs);

    if (any(greaterThan(density, vec4(minDensity)))) {
      // Sample a detailed density.
      float density = sampleDensityDetail(cs, position, mipLevel);
      if (density > minDensity) {
        #ifdef ACCURATE_ATMOSPHERIC_IRRADIANCE
        sunIrradiance = GetSunAndSkyIrradiance(
          position * METER_TO_UNIT_LENGTH,
          sunDirection,
          skyIrradiance
        );
        #endif // ACCURATE_ATMOSPHERIC_IRRADIANCE

        vec3 radiance = marchToLight(
          position,
          sunDirection,
          sunIrradiance,
          skyIrradiance,
          cosTheta,
          density,
          mipLevel
        );
        #ifdef USE_POWDER
        // radiance *= 1.0 - powderScale * exp(-density * powderExponent);
        radiance *= min(1.0, pow(density * powderScale, powderExponent));
        #endif // USE_POWDER

        // Energy-conserving analytical integration of scattered light
        // See 5.6.3 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
        float transmittance = exp(-density * stepSize);
        float clampedDensity = max(density, 1e-7);
        vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedDensity;
        radianceIntegral += transmittanceIntegral * scatteringIntegral;
        transmittanceIntegral *= transmittance;

        // Aerial perspective affecting clouds
        // See 5.9.1 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
        weightedDistanceSum += rayDistance * transmittanceIntegral;
        transmittanceSum += transmittanceIntegral;
      }

      // Take a shorter step because we've already hit the clouds.
      stepSize *= 1.005;
      rayDistance += stepSize;
    } else {
      // Otherwise step longer in empty space.
      // TODO: Apply more jitter when we entered empty space.
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
    }
    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }
  }
  // The final product of 5.9.1 and we'll evaluate this in aerial perspective.
  weightedMeanDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : 0.0;
  return vec4(
    radianceIntegral,
    saturate(remap(transmittanceIntegral, minTransmittance, 1.0, 1.0, 0.0))
  );
}

void main() {
  vec3 rayDirection = normalize(vRayDirection);
  float jitter = blueNoise(vUv);

  float r = length(vViewPosition - vEllipsoidCenter) * METER_TO_UNIT_LENGTH;
  float mu = dot(vViewPosition * METER_TO_UNIT_LENGTH, rayDirection) / r;
  bool intersectsGround = RayIntersectsGround(r, mu);

  // TODO: Calculate by r and mu parametrization.
  float rayNear;
  float rayFar;
  if (cameraHeight < minHeight) {
    if (intersectsGround) {
      discard;
    }
    rayNear = raySphereSecondIntersection(
      vViewPosition,
      rayDirection,
      vEllipsoidCenter,
      bottomRadius + minHeight
    );
    rayFar = raySphereSecondIntersection(
      vViewPosition,
      rayDirection,
      vEllipsoidCenter,
      bottomRadius + maxHeight
    );
    rayFar = min(rayFar, maxRayDistance);
  } else if (cameraHeight < maxHeight) {
    rayNear = 0.0;
    if (intersectsGround) {
      rayFar = raySphereFirstIntersection(
        vViewPosition,
        rayDirection,
        vEllipsoidCenter,
        bottomRadius + minHeight
      );
    } else {
      rayFar = raySphereSecondIntersection(
        vViewPosition,
        rayDirection,
        vEllipsoidCenter,
        bottomRadius + maxHeight
      );
    }
  } else {
    float intersection1;
    float intersection2;
    raySphereIntersections(
      vViewPosition,
      rayDirection,
      vEllipsoidCenter,
      bottomRadius + maxHeight,
      intersection1,
      intersection2
    );
    rayNear = intersection1;
    if (intersectsGround) {
      rayFar = raySphereFirstIntersection(
        vViewPosition,
        rayDirection,
        vEllipsoidCenter,
        bottomRadius + minHeight
      );
    } else {
      rayFar = intersection2;
    }
  }
  if (rayNear < 0.0) {
    discard;
  }

  // Clamp the ray at the scene objects.
  float depth = readDepth(vUv);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    float viewZ = getViewZ(depth);
    float rayDistance = -viewZ / dot(rayDirection, vViewDirection);
    rayFar = min(rayFar, rayDistance);
  }

  vec3 camera = vViewPosition - vEllipsoidCenter;
  vec3 rayOrigin = camera + rayNear * rayDirection;

  vec2 globeUv = getGlobeUv(rayOrigin);
  float mipLevel = getMipLevel(globeUv * coverageDetailFrequency);
  mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));

  vec3 skyIrradiance;
  vec3 sunIrradiance;
  #ifndef ACCURATE_ATMOSPHERIC_IRRADIANCE
  // Sample the irradiance at the near point for a rough estimate.
  sunIrradiance = GetSunAndSkyIrradiance(
    rayOrigin * METER_TO_UNIT_LENGTH,
    sunDirection,
    skyIrradiance
  );
  #endif // ACCURATE_ATMOSPHERIC_IRRADIANCE

  float weightedMeanDepth;
  vec4 color = marchToCloud(
    camera,
    rayOrigin,
    rayDirection,
    jitter,
    rayFar - rayNear,
    pow(2.0, mipLevel),
    sunDirection,
    sunIrradiance,
    skyIrradiance,
    weightedMeanDepth
  );

  if (weightedMeanDepth > 0.0) {
    weightedMeanDepth += rayNear;
    vec3 point = camera + weightedMeanDepth * rayDirection;
    applyAerialPerspective(camera, point, color);
  }

  outputColor = color;
}
