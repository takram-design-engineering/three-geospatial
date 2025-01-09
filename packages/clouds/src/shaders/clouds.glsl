// Straightforward spherical mapping
vec2 getSphericalUv(const vec3 position) {
  vec2 st = normalize(position.yx);
  float phi = atan(st.x, st.y);
  float theta = asin(normalize(position).z);
  return vec2(phi * RECIPROCAL_PI2 + 0.5, theta * RECIPROCAL_PI + 0.5);
}

vec2 getCubeSphereUv(const vec3 position) {
  // Cube-sphere relaxation by: http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html
  // TODO: Tile and fix seams.
  // Possible improvements:
  // https://iquilezles.org/articles/texturerepetition/
  // https://gamedev.stackexchange.com/questions/184388/fragment-shader-map-dot-texture-repeatedly-over-the-sphere
  // https://github.com/mmikk/hextile-demo

  vec3 n = normalize(position);
  vec3 f = abs(n);
  vec3 c = n / max(f.x, max(f.y, f.z));
  vec2 m;
  if (all(greaterThan(f.yy, f.xz))) {
    m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;
  } else if (all(greaterThan(f.xx, f.yz))) {
    m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);
  } else {
    m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);
  }

  vec2 m2 = m * m;
  float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
  float q2 = q * q;
  vec2 uv;
  uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);
  uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;
  return uv * 0.5 + 0.5;
}

vec2 getGlobeUv(const vec3 position) {
  vec2 uv = getCubeSphereUv(position);
  return uv + localWeatherOffset;
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
    shape = 1.0 - shape; // Modulation for fluffy shape
    density = mix(density, saturate(remap(density, shape, 1.0, 0.0, 1.0)), detailAmounts);

    #ifdef USE_DETAIL
    if (mipLevel < 0.5) {
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
