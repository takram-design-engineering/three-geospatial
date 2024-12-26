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

  vec4 localWeather = pow(
    textureLod(localWeatherTexture, uv * localWeatherFrequency, mipLevel),
    weatherExponents
  );
  vec4 heightScale = shapeAlteringFunction(weather.heightFraction, 0.4);

  // Modulation to control weather by coverage parameter.
  // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63
  vec4 factor = 1.0 - coverage * heightScale;
  weather.density = saturate(
    remap(
      mix(localWeather, vec4(1.0), coverageFilterWidths),
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
    float shape = textureLod(shapeTexture, position * shapeFrequency, 0.0).r;
    // shape = pow(shape, 6.0) * 0.4; // Modulation for whippier shape
    shape = 1.0 - shape; // Or invert for fluffy shape
    density = mix(density, saturate(remap(density, shape, 1.0, 0.0, 1.0)), detailAmounts);

    #ifdef USE_DETAIL
    if (mipLevel < 1.0) {
      float detail = textureLod(shapeDetailTexture, position * shapeDetailFrequency, 0.0).r;
      // Fluffy at the top and whippy at the bottom.
      vec4 modifier = mix(
        vec4(pow(detail, 6.0)),
        vec4(1.0 - detail),
        saturate(remap(weather.heightFraction, 0.2, 0.4, 0.0, 1.0))
      );
      modifier = mix(vec4(0.0), modifier, detailAmounts);
      density = saturate(
        remap(density * 2.0, vec4(modifier * 0.5), vec4(1.0), vec4(0.0), vec4(1.0))
      );
    }
    #endif
  }
  // Nicely decrease density at the bottom.
  return saturate(dot(density, extinctionCoeffs * weather.heightFraction));
}
