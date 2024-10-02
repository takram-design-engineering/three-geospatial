// Based on the following work and adapted to Three.js.

/**
 * Copyright (c) 2017 Eric Bruneton
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
 *
 * Precomputed Atmospheric Scattering
 * Copyright (c) 2008 INRIA
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

precision highp float;
precision highp sampler3D;

const int TRANSMITTANCE_TEXTURE_WIDTH = 256;
const int TRANSMITTANCE_TEXTURE_HEIGHT = 64;
const int SCATTERING_TEXTURE_R_SIZE = 32;
const int SCATTERING_TEXTURE_MU_SIZE = 128;
const int SCATTERING_TEXTURE_MU_S_SIZE = 32;
const int SCATTERING_TEXTURE_NU_SIZE = 8;
const int IRRADIANCE_TEXTURE_WIDTH = 64;
const int IRRADIANCE_TEXTURE_HEIGHT = 16;

#ifndef PI
#define PI (3.14159265358979323846)
#endif

const float m = 1.0;
const float nm = 1.0;
const float rad = 1.0;
const float sr = 1.0;
const float watt = 1.0;
const float m2 = m * m;
const float watt_per_square_meter = watt / m2;
const float watt_per_square_meter_per_sr = watt / (m2 * sr);
const float watt_per_square_meter_per_sr_per_nm = watt / (m2 * sr * nm);

struct AtmosphereParameters {
  vec3 solar_irradiance;
  float sun_angular_radius;
  float bottom_radius;
  float top_radius;
  vec3 rayleigh_scattering;
  vec3 mie_scattering;
  float mie_phase_function_g;
  float mu_s_min;
};

const AtmosphereParameters ATMOSPHERE = AtmosphereParameters(
  vec3(1.474, 1.8504, 1.91198), // solar_irradiance
  0.004675, // sun_angular_radius
  6360.0, // bottom_radius
  6420.0, // top_radius
  vec3(0.005802, 0.013558, 0.0331), // rayleigh_scattering
  vec3(0.003996, 0.003996, 0.003996), // mie_scattering
  0.8, // mie_phase_function_g
  -0.207912 // mu_s_min
);

float ClampCosine(float mu) {
  return clamp(mu, float(-1.0), float(1.0));
}

float ClampDistance(float d) {
  return max(d, 0.0 * m);
}

float ClampRadius(const AtmosphereParameters atmosphere, float r) {
  return clamp(r, atmosphere.bottom_radius, atmosphere.top_radius);
}

float SafeSqrt(float a) {
  return sqrt(max(a, 0.0 * m2));
}

float DistanceToTopAtmosphereBoundary(
  const AtmosphereParameters atmosphere,
  float r,
  float mu
) {
  float discriminant =
    r * r * (mu * mu - 1.0) + atmosphere.top_radius * atmosphere.top_radius;
  return ClampDistance(-r * mu + SafeSqrt(discriminant));
}

float DistanceToBottomAtmosphereBoundary(
  const AtmosphereParameters atmosphere,
  float r,
  float mu
) {
  float discriminant =
    r * r * (mu * mu - 1.0) +
    atmosphere.bottom_radius * atmosphere.bottom_radius;
  return ClampDistance(-r * mu - SafeSqrt(discriminant));
}

bool RayIntersectsGround(
  const AtmosphereParameters atmosphere,
  float r,
  float mu
) {
  return mu < 0.0 &&
  r * r * (mu * mu - 1.0) +
    atmosphere.bottom_radius * atmosphere.bottom_radius >=
    0.0 * m2;
}

float GetTextureCoordFromUnitRange(float x, int texture_size) {
  return 0.5 / float(texture_size) + x * (1.0 - 1.0 / float(texture_size));
}

float GetUnitRangeFromTextureCoord(float u, int texture_size) {
  return (u - 0.5 / float(texture_size)) / (1.0 - 1.0 / float(texture_size));
}

vec2 GetTransmittanceTextureUvFromRMu(
  const AtmosphereParameters atmosphere,
  float r,
  float mu
) {
  float H = sqrt(
    atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius
  );
  float rho = SafeSqrt(
    r * r - atmosphere.bottom_radius * atmosphere.bottom_radius
  );
  float d = DistanceToTopAtmosphereBoundary(atmosphere, r, mu);
  float d_min = atmosphere.top_radius - r;
  float d_max = rho + H;
  float x_mu = (d - d_min) / (d_max - d_min);
  float x_r = rho / H;
  return vec2(
    GetTextureCoordFromUnitRange(x_mu, TRANSMITTANCE_TEXTURE_WIDTH),
    GetTextureCoordFromUnitRange(x_r, TRANSMITTANCE_TEXTURE_HEIGHT)
  );
}

vec3 GetTransmittanceToTopAtmosphereBoundary(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  float r,
  float mu
) {
  vec2 uv = GetTransmittanceTextureUvFromRMu(atmosphere, r, mu);
  return vec3(texture(transmittance_texture, uv));
}

vec3 GetTransmittance(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  float r,
  float mu,
  float d,
  bool ray_r_mu_intersects_ground
) {
  float r_d = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
  float mu_d = ClampCosine((r * mu + d) / r_d);
  if (ray_r_mu_intersects_ground) {
    return min(
      GetTransmittanceToTopAtmosphereBoundary(
        atmosphere,
        transmittance_texture,
        r_d,
        -mu_d
      ) /
        GetTransmittanceToTopAtmosphereBoundary(
          atmosphere,
          transmittance_texture,
          r,
          -mu
        ),
      vec3(1.0)
    );
  } else {
    return min(
      GetTransmittanceToTopAtmosphereBoundary(
        atmosphere,
        transmittance_texture,
        r,
        mu
      ) /
        GetTransmittanceToTopAtmosphereBoundary(
          atmosphere,
          transmittance_texture,
          r_d,
          mu_d
        ),
      vec3(1.0)
    );
  }
}

vec3 GetTransmittanceToSun(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  float r,
  float mu_s
) {
  float sin_theta_h = atmosphere.bottom_radius / r;
  float cos_theta_h = -sqrt(max(1.0 - sin_theta_h * sin_theta_h, 0.0));
  return GetTransmittanceToTopAtmosphereBoundary(
    atmosphere,
    transmittance_texture,
    r,
    mu_s
  ) *
  smoothstep(
    -sin_theta_h * atmosphere.sun_angular_radius / rad,
    sin_theta_h * atmosphere.sun_angular_radius / rad,
    mu_s - cos_theta_h
  );
}

float DistanceToNearestAtmosphereBoundary(
  const AtmosphereParameters atmosphere,
  float r,
  float mu,
  bool ray_r_mu_intersects_ground
) {
  if (ray_r_mu_intersects_ground) {
    return DistanceToBottomAtmosphereBoundary(atmosphere, r, mu);
  } else {
    return DistanceToTopAtmosphereBoundary(atmosphere, r, mu);
  }
}

float RayleighPhaseFunction(float nu) {
  float k = 3.0 / (16.0 * PI * sr);
  return k * (1.0 + nu * nu);
}

float MiePhaseFunction(float g, float nu) {
  float k = 3.0 / (8.0 * PI * sr) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + nu * nu) / pow(1.0 + g * g - 2.0 * g * nu, 1.5);
}

vec4 GetScatteringTextureUvwzFromRMuMuSNu(
  const AtmosphereParameters atmosphere,
  float r,
  float mu,
  float mu_s,
  float nu,
  bool ray_r_mu_intersects_ground
) {
  float H = sqrt(
    atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius
  );
  float rho = SafeSqrt(
    r * r - atmosphere.bottom_radius * atmosphere.bottom_radius
  );
  float u_r = GetTextureCoordFromUnitRange(rho / H, SCATTERING_TEXTURE_R_SIZE);
  float r_mu = r * mu;
  float discriminant =
    r_mu * r_mu - r * r + atmosphere.bottom_radius * atmosphere.bottom_radius;
  float u_mu;
  if (ray_r_mu_intersects_ground) {
    float d = -r_mu - SafeSqrt(discriminant);
    float d_min = r - atmosphere.bottom_radius;
    float d_max = rho;
    u_mu =
      0.5 -
      0.5 *
        GetTextureCoordFromUnitRange(
          d_max == d_min
            ? 0.0
            : (d - d_min) / (d_max - d_min),
          SCATTERING_TEXTURE_MU_SIZE / 2
        );
  } else {
    float d = -r_mu + SafeSqrt(discriminant + H * H);
    float d_min = atmosphere.top_radius - r;
    float d_max = rho + H;
    u_mu =
      0.5 +
      0.5 *
        GetTextureCoordFromUnitRange(
          (d - d_min) / (d_max - d_min),
          SCATTERING_TEXTURE_MU_SIZE / 2
        );
  }
  float d = DistanceToTopAtmosphereBoundary(
    atmosphere,
    atmosphere.bottom_radius,
    mu_s
  );
  float d_min = atmosphere.top_radius - atmosphere.bottom_radius;
  float d_max = H;
  float a = (d - d_min) / (d_max - d_min);
  float D = DistanceToTopAtmosphereBoundary(
    atmosphere,
    atmosphere.bottom_radius,
    atmosphere.mu_s_min
  );
  float A = (D - d_min) / (d_max - d_min);
  float u_mu_s = GetTextureCoordFromUnitRange(
    max(1.0 - a / A, 0.0) / (1.0 + a),
    SCATTERING_TEXTURE_MU_S_SIZE
  );
  float u_nu = (nu + 1.0) / 2.0;
  return vec4(u_nu, u_mu_s, u_mu, u_r);
}

vec3 GetScattering(
  const AtmosphereParameters atmosphere,
  const sampler3D scattering_texture,
  float r,
  float mu,
  float mu_s,
  float nu,
  bool ray_r_mu_intersects_ground
) {
  vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(
    atmosphere,
    r,
    mu,
    mu_s,
    nu,
    ray_r_mu_intersects_ground
  );
  float tex_coord_x = uvwz.x * float(SCATTERING_TEXTURE_NU_SIZE - 1);
  float tex_x = floor(tex_coord_x);
  float lerp = tex_coord_x - tex_x;
  vec3 uvw0 = vec3(
    (tex_x + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE),
    uvwz.z,
    uvwz.w
  );
  vec3 uvw1 = vec3(
    (tex_x + 1.0 + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE),
    uvwz.z,
    uvwz.w
  );
  return vec3(
    texture(scattering_texture, uvw0) * (1.0 - lerp) +
      texture(scattering_texture, uvw1) * lerp
  );
}

vec3 GetScattering(
  const AtmosphereParameters atmosphere,
  const sampler3D single_rayleigh_scattering_texture,
  const sampler3D single_mie_scattering_texture,
  const sampler3D multiple_scattering_texture,
  float r,
  float mu,
  float mu_s,
  float nu,
  bool ray_r_mu_intersects_ground,
  int scattering_order
) {
  if (scattering_order == 1) {
    vec3 rayleigh = GetScattering(
      atmosphere,
      single_rayleigh_scattering_texture,
      r,
      mu,
      mu_s,
      nu,
      ray_r_mu_intersects_ground
    );
    vec3 mie = GetScattering(
      atmosphere,
      single_mie_scattering_texture,
      r,
      mu,
      mu_s,
      nu,
      ray_r_mu_intersects_ground
    );
    return rayleigh * RayleighPhaseFunction(nu) +
    mie * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
  } else {
    return GetScattering(
      atmosphere,
      multiple_scattering_texture,
      r,
      mu,
      mu_s,
      nu,
      ray_r_mu_intersects_ground
    );
  }
}

vec3 GetIrradiance(
  const AtmosphereParameters atmosphere,
  const sampler2D irradiance_texture,
  float r,
  float mu_s
);

vec2 GetIrradianceTextureUvFromRMuS(
  const AtmosphereParameters atmosphere,
  float r,
  float mu_s
) {
  float x_r =
    (r - atmosphere.bottom_radius) /
    (atmosphere.top_radius - atmosphere.bottom_radius);
  float x_mu_s = mu_s * 0.5 + 0.5;
  return vec2(
    GetTextureCoordFromUnitRange(x_mu_s, IRRADIANCE_TEXTURE_WIDTH),
    GetTextureCoordFromUnitRange(x_r, IRRADIANCE_TEXTURE_HEIGHT)
  );
}

const vec2 IRRADIANCE_TEXTURE_SIZE = vec2(
  IRRADIANCE_TEXTURE_WIDTH,
  IRRADIANCE_TEXTURE_HEIGHT
);

vec3 GetIrradiance(
  const AtmosphereParameters atmosphere,
  const sampler2D irradiance_texture,
  float r,
  float mu_s
) {
  vec2 uv = GetIrradianceTextureUvFromRMuS(atmosphere, r, mu_s);
  return vec3(texture(irradiance_texture, uv));
}

vec3 GetExtrapolatedSingleMieScattering(
  const AtmosphereParameters atmosphere,
  const vec4 scattering
) {
  if (scattering.r <= 0.0) {
    return vec3(0.0);
  }
  return scattering.rgb *
  scattering.a /
  scattering.r *
  (atmosphere.rayleigh_scattering.r / atmosphere.mie_scattering.r) *
  (atmosphere.mie_scattering / atmosphere.rayleigh_scattering);
}

vec3 GetCombinedScattering(
  const AtmosphereParameters atmosphere,
  const sampler3D scattering_texture,
  const sampler3D single_mie_scattering_texture,
  float r,
  float mu,
  float mu_s,
  float nu,
  bool ray_r_mu_intersects_ground,
  out vec3 single_mie_scattering
) {
  vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(
    atmosphere,
    r,
    mu,
    mu_s,
    nu,
    ray_r_mu_intersects_ground
  );
  float tex_coord_x = uvwz.x * float(SCATTERING_TEXTURE_NU_SIZE - 1);
  float tex_x = floor(tex_coord_x);
  float lerp = tex_coord_x - tex_x;
  vec3 uvw0 = vec3(
    (tex_x + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE),
    uvwz.z,
    uvwz.w
  );
  vec3 uvw1 = vec3(
    (tex_x + 1.0 + uvwz.y) / float(SCATTERING_TEXTURE_NU_SIZE),
    uvwz.z,
    uvwz.w
  );
  vec4 combined_scattering =
    texture(scattering_texture, uvw0) * (1.0 - lerp) +
    texture(scattering_texture, uvw1) * lerp;
  vec3 scattering = vec3(combined_scattering);
  single_mie_scattering = GetExtrapolatedSingleMieScattering(
    atmosphere,
    combined_scattering
  );
  return scattering;
}

vec3 GetSkyRadiance(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  const sampler3D scattering_texture,
  const sampler3D single_mie_scattering_texture,
  vec3 camera,
  const vec3 view_ray,
  float shadow_length,
  const vec3 sun_direction,
  out vec3 transmittance
) {
  float r = length(camera);
  float rmu = dot(camera, view_ray);
  float distance_to_top_atmosphere_boundary =
    -rmu -
    sqrt(rmu * rmu - r * r + atmosphere.top_radius * atmosphere.top_radius);
  if (distance_to_top_atmosphere_boundary > 0.0 * m) {
    camera = camera + view_ray * distance_to_top_atmosphere_boundary;
    r = atmosphere.top_radius;
    rmu += distance_to_top_atmosphere_boundary;
  } else if (r > atmosphere.top_radius) {
    transmittance = vec3(1.0);
    return vec3(0.0 * watt_per_square_meter_per_sr_per_nm);
  }
  float mu = rmu / r;
  float mu_s = dot(camera, sun_direction) / r;
  float nu = dot(view_ray, sun_direction);
  bool ray_r_mu_intersects_ground = RayIntersectsGround(atmosphere, r, mu);
  transmittance = ray_r_mu_intersects_ground
    ? vec3(0.0)
    : GetTransmittanceToTopAtmosphereBoundary(
      atmosphere,
      transmittance_texture,
      r,
      mu
    );
  vec3 single_mie_scattering;
  vec3 scattering;
  if (shadow_length == 0.0 * m) {
    scattering = GetCombinedScattering(
      atmosphere,
      scattering_texture,
      single_mie_scattering_texture,
      r,
      mu,
      mu_s,
      nu,
      ray_r_mu_intersects_ground,
      single_mie_scattering
    );
  } else {
    float d = shadow_length;
    float r_p = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
    float mu_p = (r * mu + d) / r_p;
    float mu_s_p = (r * mu_s + d * nu) / r_p;
    scattering = GetCombinedScattering(
      atmosphere,
      scattering_texture,
      single_mie_scattering_texture,
      r_p,
      mu_p,
      mu_s_p,
      nu,
      ray_r_mu_intersects_ground,
      single_mie_scattering
    );
    vec3 shadow_transmittance = GetTransmittance(
      atmosphere,
      transmittance_texture,
      r,
      mu,
      shadow_length,
      ray_r_mu_intersects_ground
    );
    scattering = scattering * shadow_transmittance;
    single_mie_scattering = single_mie_scattering * shadow_transmittance;
  }
  return scattering * RayleighPhaseFunction(nu) +
  single_mie_scattering * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
}

vec3 GetSkyRadianceToPoint(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  const sampler3D scattering_texture,
  const sampler3D single_mie_scattering_texture,
  vec3 camera,
  const vec3 point,
  float shadow_length,
  const vec3 sun_direction,
  out vec3 transmittance
) {
  vec3 view_ray = normalize(point - camera);
  float r = length(camera);
  float rmu = dot(camera, view_ray);
  float distance_to_top_atmosphere_boundary =
    -rmu -
    sqrt(rmu * rmu - r * r + atmosphere.top_radius * atmosphere.top_radius);
  if (distance_to_top_atmosphere_boundary > 0.0 * m) {
    camera = camera + view_ray * distance_to_top_atmosphere_boundary;
    r = atmosphere.top_radius;
    rmu += distance_to_top_atmosphere_boundary;
  }
  float mu = rmu / r;
  float mu_s = dot(camera, sun_direction) / r;
  float nu = dot(view_ray, sun_direction);
  float d = length(point - camera);
  bool ray_r_mu_intersects_ground = RayIntersectsGround(atmosphere, r, mu);
  transmittance = GetTransmittance(
    atmosphere,
    transmittance_texture,
    r,
    mu,
    d,
    ray_r_mu_intersects_ground
  );
  vec3 single_mie_scattering;
  vec3 scattering = GetCombinedScattering(
    atmosphere,
    scattering_texture,
    single_mie_scattering_texture,
    r,
    mu,
    mu_s,
    nu,
    ray_r_mu_intersects_ground,
    single_mie_scattering
  );
  d = max(d - shadow_length, 0.0 * m);
  float r_p = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
  float mu_p = (r * mu + d) / r_p;
  float mu_s_p = (r * mu_s + d * nu) / r_p;
  vec3 single_mie_scattering_p;
  vec3 scattering_p = GetCombinedScattering(
    atmosphere,
    scattering_texture,
    single_mie_scattering_texture,
    r_p,
    mu_p,
    mu_s_p,
    nu,
    ray_r_mu_intersects_ground,
    single_mie_scattering_p
  );
  vec3 shadow_transmittance = transmittance;
  if (shadow_length > 0.0 * m) {
    shadow_transmittance = GetTransmittance(
      atmosphere,
      transmittance_texture,
      r,
      mu,
      d,
      ray_r_mu_intersects_ground
    );
  }
  scattering = scattering - shadow_transmittance * scattering_p;
  single_mie_scattering =
    single_mie_scattering - shadow_transmittance * single_mie_scattering_p;

  // See https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32
  if (!ray_r_mu_intersects_ground) {
    const float EPS = 0.004;
    float muHoriz = -sqrt(
      1.0 - atmosphere.bottom_radius / r * (atmosphere.bottom_radius / r)
    );
    if (abs(mu - muHoriz) < EPS) {
      float a = (mu - muHoriz + EPS) / (2.0 * EPS);
      mu = muHoriz + EPS;
      vec3 single_mie_scattering0;
      vec3 single_mie_scattering1;
      float r0 = ClampRadius(
        atmosphere,
        sqrt(d * d + 2.0 * r * mu * d + r * r)
      );
      float mu0 = clamp((r * mu + d) / r0, -1.0, 1.0);
      float mu_s_0 = clamp((r * mu_s + d * nu) / r0, -1.0, 1.0);
      vec3 inScatter0 = GetCombinedScattering(
        atmosphere,
        scattering_texture,
        single_mie_scattering_texture,
        r,
        mu,
        mu_s,
        nu,
        ray_r_mu_intersects_ground,
        single_mie_scattering0
      );
      vec3 inScatter1 = GetCombinedScattering(
        atmosphere,
        scattering_texture,
        single_mie_scattering_texture,
        r0,
        mu0,
        mu_s_0,
        nu,
        ray_r_mu_intersects_ground,
        single_mie_scattering1
      );
      vec3 inScatter = max(inScatter0 - shadow_transmittance * inScatter1, 0.0);
      vec3 mie_scattering = max(
        single_mie_scattering0 - shadow_transmittance * single_mie_scattering1,
        0.0
      );
      scattering = inScatter;
      single_mie_scattering = mie_scattering;
    }
  }

  single_mie_scattering = GetExtrapolatedSingleMieScattering(
    atmosphere,
    vec4(scattering, single_mie_scattering.r)
  );
  single_mie_scattering =
    single_mie_scattering * smoothstep(float(0.0), float(0.01), mu_s);
  return scattering * RayleighPhaseFunction(nu) +
  single_mie_scattering * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
}

vec3 GetSunAndSkyIrradiance(
  const AtmosphereParameters atmosphere,
  const sampler2D transmittance_texture,
  const sampler2D irradiance_texture,
  const vec3 point,
  const vec3 normal,
  const vec3 sun_direction,
  out vec3 sky_irradiance
) {
  float r = length(point);
  float mu_s = dot(point, sun_direction) / r;
  sky_irradiance =
    GetIrradiance(atmosphere, irradiance_texture, r, mu_s) *
    (1.0 + dot(normal, point) / r) *
    0.5;
  return atmosphere.solar_irradiance *
  GetTransmittanceToSun(atmosphere, transmittance_texture, r, mu_s) *
  max(dot(normal, sun_direction), 0.0);
}

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler2D irradiance_texture;

vec3 GetSolarRadiance() {
  return ATMOSPHERE.solar_irradiance /
  (PI * ATMOSPHERE.sun_angular_radius * ATMOSPHERE.sun_angular_radius);
}

vec3 GetSkyRadiance(
  vec3 camera,
  vec3 view_ray,
  float shadow_length,
  vec3 sun_direction,
  out vec3 transmittance
) {
  return GetSkyRadiance(
    ATMOSPHERE,
    transmittance_texture,
    scattering_texture,
    single_mie_scattering_texture,
    camera,
    view_ray,
    shadow_length,
    sun_direction,
    transmittance
  );
}

vec3 GetSkyRadianceToPoint(
  vec3 camera,
  vec3 point,
  float shadow_length,
  vec3 sun_direction,
  out vec3 transmittance
) {
  return GetSkyRadianceToPoint(
    ATMOSPHERE,
    transmittance_texture,
    scattering_texture,
    single_mie_scattering_texture,
    camera,
    point,
    shadow_length,
    sun_direction,
    transmittance
  );
}

vec3 GetSunAndSkyIrradiance(
  vec3 p,
  vec3 normal,
  vec3 sun_direction,
  out vec3 sky_irradiance
) {
  return GetSunAndSkyIrradiance(
    ATMOSPHERE,
    transmittance_texture,
    irradiance_texture,
    p,
    normal,
    sun_direction,
    sky_irradiance
  );
}
