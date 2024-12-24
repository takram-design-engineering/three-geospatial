#define RECIPROCAL_PI4 (0.07957747154594767)

uniform sampler2D depthBuffer;
uniform vec2 resolution;
uniform float cameraHeight;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 sunDirection;
uniform float skyIrradianceScale;
uniform float bottomRadius; // TODO:
uniform sampler2D blueNoiseTexture;
uniform sampler3D spatiotemporalBlueNoiseTexture;
uniform int frame;
uniform float time;

// Cloud parameters
uniform sampler3D densityTexture;
uniform sampler3D densityDetailTexture;
uniform sampler2D localWeatherTexture;
uniform float coverage;
uniform vec3 albedo;
uniform vec2 localWeatherFrequency;
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
const vec4 maxLayerHeights = vec4(1100.0, 5000.0, 8000.0, 0.0);
const vec4 densityScales = vec4(0.3, 0.1, 0.005, 0.0);
const vec4 densityDetailAmounts = vec4(1.0, 0.8, 0.3, 0.0);
const vec4 localWeatherExponents = vec4(1.0, 1.0, 2.0, 1.0);
const vec4 coverageFilterWidths = vec4(0.6, 0.3, 0.5, 0.0);

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
    spatiotemporalBlueNoiseTexture,
    vec3(
      uv * resolution / float(STBN_TEXTURE_SIZE),
      float(frame % STBN_TEXTURE_DEPTH) / float(STBN_TEXTURE_DEPTH)
    )
  ).x;
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

struct WeatherSample {
  vec4 heightFraction; // Normalized height of each layer
  vec4 density;
};

vec4 shapeAlteringFunction(const vec4 heightFraction, const float bias) {
  // Apply a semi-circle transform to round the clouds towards the top.
  vec4 biased = pow(heightFraction, vec4(bias));
  vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
  return 1.0 - x * x;
}

WeatherSample sampleWeather(const vec2 uv, const float height, const float mipLevel) {
  WeatherSample weather;
  weather.heightFraction = saturate(
    remap(vec4(height), minLayerHeights, maxLayerHeights, vec4(0.0), vec4(1.0))
  );

  vec4 weatherMap = pow(
    textureLod(localWeatherTexture, uv * localWeatherFrequency, mipLevel),
    localWeatherExponents
  );
  vec4 heightScale = shapeAlteringFunction(weather.heightFraction, 0.4);

  // Modulation to control weather by coverage parameter.
  // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63
  vec4 factor = 1.0 - coverage * heightScale;
  weather.density = saturate(
    remap(
      mix(weatherMap, vec4(1.0), coverageFilterWidths),
      factor,
      factor + coverageFilterWidths,
      vec4(0.0),
      vec4(1.0)
    )
  );

  return weather;
}

float sampleDensityDetail(WeatherSample weather, const vec3 position, const float mipLevel) {
  vec4 density = weather.density;
  if (mipLevel < 2.0) {
    float shape = textureLod(densityTexture, position * shapeFrequency, 0.0).r;
    // shape = pow(shape, 6.0) * 0.4; // Modulation for whippier shape
    shape = 1.0 - shape; // Or invert for fluffy shape
    density = mix(density, saturate(remap(density, shape, 1.0, 0.0, 1.0)), densityDetailAmounts);

    #ifdef USE_DETAIL
    if (mipLevel < 1.0) {
      float detail = textureLod(densityDetailTexture, position * shapeDetailFrequency, 0.0).r;
      // Fluffy at the top and whippy at the bottom.
      vec4 modifier = mix(
        vec4(pow(detail, 6.0)),
        vec4(1.0 - detail),
        saturate(remap(weather.heightFraction, 0.2, 0.4, 0.0, 1.0))
      );
      modifier = mix(vec4(0.0), modifier, densityDetailAmounts);
      density = saturate(
        remap(density * 2.0, vec4(modifier * 0.5), vec4(1.0), vec4(0.0), vec4(1.0))
      );
    }
    #endif
  }
  // Nicely decrease density at the bottom.
  return saturate(dot(density, densityScales * weather.heightFraction));
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

float multipleScattering(const float opticalDepth, const float cosTheta) {
  // Multiple scattering approximation
  // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  // Attenuation (a), contribution (b) and phase attenuation (c).
  vec3 abc = vec3(1.0);
  const vec3 attenuation = vec3(0.5, 0.5, 0.8); // Should satisfy a <= b
  float scattering = 0.0;
  for (int octave = 0; octave < MULTI_SCATTERING_OCTAVES; ++octave) {
    float beerLambert = exp(-opticalDepth * abc.y);
    // A similar approximation is described in the Frostbite's paper, where
    // phase angle is attenuated.
    scattering += abc.x * beerLambert * phaseFunction(cosTheta * abc.z, abc.z);
    abc *= attenuation;
  }
  return scattering;
}

// TODO: Raymarch to light for near clouds, and implement BSM for far clouds.
float marchToLight(
  const vec3 rayOrigin,
  const vec3 sunDirection,
  const float cosTheta,
  const float mipLevel
) {
  const float stepSize = 10.0;
  float opticalDepth = 0.0;
  float stepScale = 1.0;
  float prevStepScale = 0.0;
  for (int i = 0; i < 6; ++i) {
    vec3 position = rayOrigin + sunDirection * stepScale * stepSize;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    float density = sampleDensityDetail(weather, position, mipLevel);
    opticalDepth += density * (stepScale - prevStepScale) * stepSize;
    prevStepScale = stepScale;
    stepScale *= 2.0;
    // For n = 4:
    // stepScale *= 2.82842712474619; // pow(64, 1/4) to match n = 6 and s = 2
  }
  return multipleScattering(opticalDepth, cosTheta);
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
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample a detailed density.
      float density = sampleDensityDetail(weather, position, mipLevel);
      if (density > minDensity) {
        #ifdef ACCURATE_ATMOSPHERIC_IRRADIANCE
        sunIrradiance = GetSunAndSkyIrradiance(
          position * METER_TO_UNIT_LENGTH,
          sunDirection,
          skyIrradiance
        );
        #endif // ACCURATE_ATMOSPHERIC_IRRADIANCE

        float scattering = marchToLight(position, sunDirection, cosTheta, mipLevel);
        vec3 radiance = (sunIrradiance * scattering + skyIrradiance * skyIrradianceScale) * density;

        #ifdef USE_POWDER
        radiance *= 1.0 - powderScale * exp(-density * powderExponent);
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
  float mipLevel = getMipLevel(globeUv * localWeatherFrequency);
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
