// Based on the following work and adapted to Three.js.

/**
 * Copyright (c) 2018 Eric Bruneton
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

const float kLengthUnitInMeters = 1000.0;

uniform vec3 camera;
uniform float exposure;
uniform vec3 earth_center;
uniform vec3 sun_direction;
uniform vec2 sun_size;

in vec3 view_ray;
layout(location = 0) out vec4 color;

const vec3 kSphereCenter =
  vec3(-3959665.998119834, 3350076.5146477497, 3699516.793681536) /
  kLengthUnitInMeters;
const float kSphereRadius = 100.0 / kLengthUnitInMeters;
const vec3 kSphereAlbedo = vec3(0.8);
const vec3 kGroundAlbedo = vec3(0.0, 0.0, 0.04);

#ifdef USE_LUMINANCE
#define GetSolarRadiance (GetSolarLuminance)
#define GetSkyRadiance (GetSkyLuminance)
#define GetSkyRadianceToPoint (GetSkyLuminanceToPoint)
#define GetSunAndSkyIrradiance (GetSunAndSkyIlluminance)
#endif // USE_LUMINANCE

vec3 GetSolarRadiance();

vec3 GetSkyRadiance(
  vec3 camera,
  vec3 view_ray,
  float shadow_length,
  vec3 sun_direction,
  out vec3 transmittance
);

vec3 GetSkyRadianceToPoint(
  vec3 camera,
  vec3 point,
  float shadow_length,
  vec3 sun_direction,
  out vec3 transmittance
);

vec3 GetSunAndSkyIrradiance(
  vec3 p,
  vec3 normal,
  vec3 sun_direction,
  out vec3 sky_irradiance
);

float GetSunVisibility(vec3 point, vec3 sun_direction) {
  vec3 p = point - kSphereCenter;
  float p_dot_v = dot(p, sun_direction);
  float p_dot_p = dot(p, p);
  float ray_sphere_center_squared_distance = p_dot_p - p_dot_v * p_dot_v;
  float distance_to_intersection =
    -p_dot_v -
    sqrt(kSphereRadius * kSphereRadius - ray_sphere_center_squared_distance);
  if (distance_to_intersection > 0.0) {
    float ray_sphere_distance =
      kSphereRadius - sqrt(ray_sphere_center_squared_distance);
    float ray_sphere_angular_distance = -ray_sphere_distance / p_dot_v;
    return smoothstep(1.0, 0.0, ray_sphere_angular_distance / sun_size.x);
  }
  return 1.0;
}

float GetSkyVisibility(vec3 point) {
  vec3 p = point - kSphereCenter;
  float p_dot_p = dot(p, p);
  return 1.0 + p.z / sqrt(p_dot_p) * kSphereRadius * kSphereRadius / p_dot_p;
}

void GetSphereShadowInOut(
  vec3 view_direction,
  vec3 sun_direction,
  out float d_in,
  out float d_out
) {
  vec3 pos = camera - kSphereCenter;
  float pos_dot_sun = dot(pos, sun_direction);
  float view_dot_sun = dot(view_direction, sun_direction);
  float k = sun_size.x;
  float l = 1.0 + k * k;
  float a = 1.0 - l * view_dot_sun * view_dot_sun;
  float b =
    dot(pos, view_direction) -
    l * pos_dot_sun * view_dot_sun -
    k * kSphereRadius * view_dot_sun;
  float c =
    dot(pos, pos) -
    l * pos_dot_sun * pos_dot_sun -
    2.0 * k * kSphereRadius * pos_dot_sun -
    kSphereRadius * kSphereRadius;
  float discriminant = b * b - a * c;
  if (discriminant > 0.0) {
    d_in = max(0.0, (-b - sqrt(discriminant)) / a);
    d_out = (-b + sqrt(discriminant)) / a;
    float d_base = -pos_dot_sun / view_dot_sun;
    float d_apex = -(pos_dot_sun + kSphereRadius / k) / view_dot_sun;
    if (view_dot_sun > 0.0) {
      d_in = max(d_in, d_apex);
      d_out = a > 0.0 ? min(d_out, d_base) : d_base;
    } else {
      d_in = a > 0.0 ? max(d_in, d_base) : d_base;
      d_out = min(d_out, d_apex);
    }
  } else {
    d_in = 0.0;
    d_out = 0.0;
  }
}

void main() {
  vec3 view_direction = normalize(view_ray);
  float fragment_angular_size =
    length(dFdx(view_ray) + dFdy(view_ray)) / length(view_ray);
  float shadow_in;
  float shadow_out;
  // GetSphereShadowInOut(view_direction, sun_direction, shadow_in, shadow_out);
  float lightshaft_fadein_hack = smoothstep(
    0.02,
    0.04,
    dot(normalize(camera - earth_center), sun_direction)
  );
  vec3 p = camera - kSphereCenter;
  float p_dot_v = dot(p, view_direction);
  float p_dot_p = dot(p, p);
  float ray_sphere_center_squared_distance = p_dot_p - p_dot_v * p_dot_v;
  float distance_to_intersection =
    -p_dot_v -
    sqrt(kSphereRadius * kSphereRadius - ray_sphere_center_squared_distance);
  float sphere_alpha = 0.0;
  vec3 sphere_radiance = vec3(0.0);
  if (distance_to_intersection > 0.0) {
    float ray_sphere_distance =
      kSphereRadius - sqrt(ray_sphere_center_squared_distance);
    float ray_sphere_angular_distance = -ray_sphere_distance / p_dot_v;
    sphere_alpha = min(
      ray_sphere_angular_distance / fragment_angular_size,
      1.0
    );
    vec3 point = camera + view_direction * distance_to_intersection;
    vec3 normal = normalize(point - kSphereCenter);
    vec3 sky_irradiance;
    vec3 sun_irradiance = GetSunAndSkyIrradiance(
      point - earth_center,
      normal,
      sun_direction,
      sky_irradiance
    );
    sphere_radiance =
      kSphereAlbedo * (1.0 / PI) * (sun_irradiance + sky_irradiance);
    float shadow_length =
      max(0.0, min(shadow_out, distance_to_intersection) - shadow_in) *
      lightshaft_fadein_hack;
    vec3 transmittance;
    vec3 in_scatter = GetSkyRadianceToPoint(
      camera - earth_center,
      point - earth_center,
      shadow_length,
      sun_direction,
      transmittance
    );
    sphere_radiance = sphere_radiance * transmittance + in_scatter;
  }
  p = camera - earth_center;
  p_dot_v = dot(p, view_direction);
  p_dot_p = dot(p, p);
  float ray_earth_center_squared_distance = p_dot_p - p_dot_v * p_dot_v;
  distance_to_intersection =
    -p_dot_v -
    sqrt(earth_center.z * earth_center.z - ray_earth_center_squared_distance);
  float ground_alpha = 0.0;
  vec3 ground_radiance = vec3(0.0);
  if (distance_to_intersection > 0.0) {
    vec3 point = camera + view_direction * distance_to_intersection;
    vec3 normal = normalize(point - earth_center);
    vec3 sky_irradiance;
    vec3 sun_irradiance = GetSunAndSkyIrradiance(
      point - earth_center,
      normal,
      sun_direction,
      sky_irradiance
    );
    ground_radiance =
      kGroundAlbedo *
      (1.0 / PI) *
      (sun_irradiance * GetSunVisibility(point, sun_direction) +
        sky_irradiance * GetSkyVisibility(point));
    float shadow_length =
      max(0.0, min(shadow_out, distance_to_intersection) - shadow_in) *
      lightshaft_fadein_hack;
    vec3 transmittance;
    vec3 in_scatter = GetSkyRadianceToPoint(
      camera - earth_center,
      point - earth_center,
      shadow_length,
      sun_direction,
      transmittance
    );
    ground_radiance = ground_radiance * transmittance + in_scatter;
    ground_alpha = 1.0;
  }
  float shadow_length =
    max(0.0, shadow_out - shadow_in) * lightshaft_fadein_hack;
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    camera - earth_center,
    view_direction,
    shadow_length,
    sun_direction,
    transmittance
  );
  if (dot(view_direction, sun_direction) > sun_size.y) {
    radiance = radiance + transmittance * GetSolarRadiance();
  }
  radiance = mix(radiance, ground_radiance, ground_alpha);
  radiance = mix(radiance, sphere_radiance, sphere_alpha);
  color.rgb = radiance * exposure;
  color.a = 1.0;
}
