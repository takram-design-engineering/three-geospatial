uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;

in vec3 vWorldPosition;
in vec3 vWorldDirection;
in vec3 vEllipsoidCenter;

layout(location = 0) out vec4 outputColor;
layout(location = 1) out vec4 outputNormalPBR;

vec3 GetLunarRadiance() {
  // Not a physical number but the order of 10^-6 relative to the sun may fit.
  return u_solar_irradiance *
  0.000002 *
  lunarRadianceScale /
  (PI * moonAngularRadius * moonAngularRadius);
}

vec3 GetLunarLuminance() {
  return GetLunarRadiance() * SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
}

vec3 GetLunarRadLum() {
  #ifdef PHOTOMETRIC
  return GetLunarLuminance();
  #else
  return GetLunarRadiance();
  #endif
}

float intersectSphere(vec3 ray, vec3 point, float radius) {
  vec3 P = -point;
  float PoR = dot(P, ray);
  float D = dot(P, P) - radius * radius;
  return -PoR - sqrt(PoR * PoR - D);
}

float orenNayarDiffuse(const vec3 L, const vec3 V, const vec3 N) {
  float NoL = dot(N, L);
  float NoV = dot(N, V);
  float s = dot(L, V) - NoL * NoV;
  float t = mix(1.0, max(NoL, NoV), step(0.0, s));
  return max(0.0, NoL) * (0.62406015 + 0.41284404 * s / t);
}

void main() {
  vec3 viewDirection = normalize(vWorldDirection);
  vec3 transmittance;
  vec3 radLum = GetSkyRadLum(
    vWorldPosition - vEllipsoidCenter,
    viewDirection,
    0.0, // TODO: Shadow length
    sunDirection,
    transmittance
  );

  #if defined(SUN) || defined(MOON)
  vec3 ddx = dFdx(vWorldDirection);
  vec3 ddy = dFdy(vWorldDirection);
  float fragmentAngle = length(ddx + ddy) / length(vWorldDirection);
  #endif

  #ifdef SUN
  float viewDotSun = dot(viewDirection, sunDirection);
  if (viewDotSun > cos(u_sun_angular_radius)) {
    float angle = acos(clamp(viewDotSun, -1.0, 1.0));
    float antialias = smoothstep(
      u_sun_angular_radius,
      u_sun_angular_radius - fragmentAngle,
      angle
    );
    radLum += transmittance * GetSolarRadLum() * antialias;
  }
  #endif

  #ifdef MOON
  float intersection = intersectSphere(
    viewDirection,
    moonDirection,
    moonAngularRadius
  );
  if (intersection > 0.0) {
    vec3 normal = normalize(moonDirection - viewDirection * intersection);
    float diffuse = orenNayarDiffuse(-sunDirection, viewDirection, normal);
    float viewDotMoon = dot(viewDirection, moonDirection);
    float angle = acos(clamp(viewDotMoon, -1.0, 1.0));
    float antialias = smoothstep(
      moonAngularRadius,
      moonAngularRadius - fragmentAngle,
      angle
    );
    radLum += transmittance * GetLunarRadLum() * diffuse * antialias;
  }
  #endif

  outputColor = vec4(radLum, 1.0);
  outputNormalPBR = vec4(0.0);
}
