precision highp float;
precision highp sampler3D;

#define RECIPROCAL_PI 0.3183098861837907

#include "core/raySphereIntersection"

#include "bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "bruneton/common"
#include "bruneton/runtime"

#include "sky"

uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform vec3 groundAlbedo;

#ifdef HAS_SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // HAS_SHADOW_LENGTH

in vec2 vUv;
in vec3 vCameraPosition;
in vec3 vRayDirection;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

void main() {
  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, vUv).r;
  #endif // HAS_SHADOW_LENGTH

  vec3 cameraPosition = vCameraPosition;
  vec3 rayDirection = normalize(vRayDirection);

  #ifdef GROUND_ALBEDO

  float r = length(cameraPosition);
  float mu = dot(cameraPosition, rayDirection) / r;
  bool intersectsGround = RayIntersectsGround(ATMOSPHERE, r, mu);
  if (intersectsGround) {
    float distanceToGround = raySphereFirstIntersection(
      cameraPosition,
      rayDirection,
      ATMOSPHERE.bottom_radius
    );
    vec3 groundPosition = rayDirection * distanceToGround + cameraPosition;
    vec3 surfaceNormal = normalize(groundPosition);
    vec3 skyIrradiance;
    vec3 sunIrradiance = GetSunAndSkyIrradiance(
      cameraPosition,
      surfaceNormal,
      sunDirection,
      skyIrradiance
    );
    vec3 transmittance;
    vec3 inscatter = GetSkyRadianceToPoint(
      cameraPosition,
      ATMOSPHERE.bottom_radius * surfaceNormal,
      shadowLength,
      sunDirection,
      transmittance
    );
    vec3 radiance = groundAlbedo * RECIPROCAL_PI * (sunIrradiance + skyIrradiance);
    outputColor.rgb = radiance * transmittance + inscatter;
  } else {
    outputColor.rgb = getSkyRadiance(
      cameraPosition,
      rayDirection,
      shadowLength,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale
    );
  }

  #else // GROUND_ALBEDO

  outputColor.rgb = getSkyRadiance(
    cameraPosition,
    rayDirection,
    shadowLength,
    sunDirection,
    moonDirection,
    moonAngularRadius,
    lunarRadianceScale
  );

  #endif // GROUND_ALBEDO

  outputColor.a = 1.0;

  #include <mrt_output>
}
