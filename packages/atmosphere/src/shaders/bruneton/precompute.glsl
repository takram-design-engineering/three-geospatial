// Based on: https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl

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

Number GetLayerDensity(const DensityProfileLayer layer, const Length altitude) {
  Number density = layer.exp_term * exp(layer.exp_scale * altitude) +
      layer.linear_term * altitude + layer.constant_term;
  return clamp(density, Number(0.0), Number(1.0));
}

Number GetProfileDensity(const DensityProfile profile, const Length altitude) {
  DensityProfileLayer layers[2] = profile.layers;
  return altitude < layers[0].width
    ? GetLayerDensity(layers[0], altitude)
    : GetLayerDensity(layers[1], altitude);
}

Length ComputeOpticalLengthToTopAtmosphereBoundary(
    const AtmosphereParameters atmosphere, const DensityProfile profile,
    const Length r, const Number mu) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu >= -1.0 && mu <= 1.0);
  // Number of intervals for the numerical integration.
  const int SAMPLE_COUNT = 500;
  // The integration step, i.e. the length of each integration interval.
  Length dx =
      DistanceToTopAtmosphereBoundary(atmosphere, r, mu) / Number(SAMPLE_COUNT);
  // Integration loop.
  Length result = 0.0 * m;
  for (int i = 0; i <= SAMPLE_COUNT; ++i) {
    Length d_i = Number(i) * dx;
    // Distance between the current sample point and the planet center.
    Length r_i = sqrt(d_i * d_i + 2.0 * r * mu * d_i + r * r);
    // Number density at the current sample point (divided by the number density
    // at the bottom of the atmosphere, yielding a dimensionless number).
    Number y_i = GetProfileDensity(profile, r_i - atmosphere.bottom_radius);
    // Sample weight (from the trapezoidal rule).
    Number weight_i = i == 0 || i == SAMPLE_COUNT ? 0.5 : 1.0;
    result += y_i * weight_i * dx;
  }
  return result;
}

DimensionlessSpectrum ComputeTransmittanceToTopAtmosphereBoundary(
    const AtmosphereParameters atmosphere, const Length r, const Number mu) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu >= -1.0 && mu <= 1.0);
  vec3 optical_depth = (
      atmosphere.rayleigh_scattering *
          ComputeOpticalLengthToTopAtmosphereBoundary(
              atmosphere, atmosphere.rayleigh_density, r, mu) +
      atmosphere.mie_extinction *
          ComputeOpticalLengthToTopAtmosphereBoundary(
              atmosphere, atmosphere.mie_density, r, mu) +
      atmosphere.absorption_extinction *
          ComputeOpticalLengthToTopAtmosphereBoundary(
              atmosphere, atmosphere.absorption_density, r, mu));
  // @shotamatsuda: Added for the precomputation stage in half-float precision.
  #ifdef TRANSMITTANCE_PRECISION_LOG
  return optical_depth;
  #else // TRANSMITTANCE_PRECISION_LOG
  return exp(-optical_depth);
  #endif // TRANSMITTANCE_PRECISION_LOG
}

Number GetUnitRangeFromTextureCoord(const Number u, const int texture_size) {
  return (u - 0.5 / Number(texture_size)) / (1.0 - 1.0 / Number(texture_size));
}

void GetRMuFromTransmittanceTextureUv(const AtmosphereParameters atmosphere,
    const vec2 uv, out Length r, out Number mu) {
  assert(uv.x >= 0.0 && uv.x <= 1.0);
  assert(uv.y >= 0.0 && uv.y <= 1.0);
  Number x_mu = GetUnitRangeFromTextureCoord(uv.x, TRANSMITTANCE_TEXTURE_WIDTH);
  Number x_r = GetUnitRangeFromTextureCoord(uv.y, TRANSMITTANCE_TEXTURE_HEIGHT);
  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  Length H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius);
  // Distance to the horizon, from which we can compute r:
  Length rho = H * x_r;
  r = sqrt(rho * rho + atmosphere.bottom_radius * atmosphere.bottom_radius);
  // Distance to the top atmosphere boundary for the ray (r,mu), and its minimum
  // and maximum values over all mu - obtained for (r,1) and (r,mu_horizon) -
  // from which we can recover mu:
  Length d_min = atmosphere.top_radius - r;
  Length d_max = rho + H;
  Length d = d_min + x_mu * (d_max - d_min);
  mu = d == 0.0 * m ? Number(1.0) : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = ClampCosine(mu);
}

DimensionlessSpectrum ComputeTransmittanceToTopAtmosphereBoundaryTexture(
    const AtmosphereParameters atmosphere, const vec2 frag_coord) {
  const vec2 TRANSMITTANCE_TEXTURE_SIZE =
      vec2(TRANSMITTANCE_TEXTURE_WIDTH, TRANSMITTANCE_TEXTURE_HEIGHT);
  Length r;
  Number mu;
  GetRMuFromTransmittanceTextureUv(
      atmosphere, frag_coord / TRANSMITTANCE_TEXTURE_SIZE, r, mu);
  return ComputeTransmittanceToTopAtmosphereBoundary(atmosphere, r, mu);
}

void ComputeSingleScatteringIntegrand(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const Length d, const bool ray_r_mu_intersects_ground,
    out DimensionlessSpectrum rayleigh, out DimensionlessSpectrum mie) {
  Length r_d = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
  Number mu_s_d = ClampCosine((r * mu_s + d * nu) / r_d);
  DimensionlessSpectrum transmittance =
      GetTransmittance(
          atmosphere, transmittance_texture, r, mu, d,
          ray_r_mu_intersects_ground) *
      GetTransmittanceToSun(
          atmosphere, transmittance_texture, r_d, mu_s_d);
  rayleigh = transmittance * GetProfileDensity(
      atmosphere.rayleigh_density, r_d - atmosphere.bottom_radius);
  mie = transmittance * GetProfileDensity(
      atmosphere.mie_density, r_d - atmosphere.bottom_radius);
}

Length DistanceToNearestAtmosphereBoundary(const AtmosphereParameters atmosphere,
    Length r, Number mu, bool ray_r_mu_intersects_ground) {
  if (ray_r_mu_intersects_ground) {
    return DistanceToBottomAtmosphereBoundary(atmosphere, r, mu);
  } else {
    return DistanceToTopAtmosphereBoundary(atmosphere, r, mu);
  }
}

void ComputeSingleScattering(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const bool ray_r_mu_intersects_ground,
    out IrradianceSpectrum rayleigh, out IrradianceSpectrum mie) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu >= -1.0 && mu <= 1.0);
  assert(mu_s >= -1.0 && mu_s <= 1.0);
  assert(nu >= -1.0 && nu <= 1.0);

  // Number of intervals for the numerical integration.
  const int SAMPLE_COUNT = 50;
  // The integration step, i.e. the length of each integration interval.
  Length dx =
      DistanceToNearestAtmosphereBoundary(atmosphere, r, mu,
          ray_r_mu_intersects_ground) / Number(SAMPLE_COUNT);
  // Integration loop.
  DimensionlessSpectrum rayleigh_sum = DimensionlessSpectrum(0.0);
  DimensionlessSpectrum mie_sum = DimensionlessSpectrum(0.0);
  for (int i = 0; i <= SAMPLE_COUNT; ++i) {
    Length d_i = Number(i) * dx;
    // The Rayleigh and Mie single scattering at the current sample point.
    DimensionlessSpectrum rayleigh_i;
    DimensionlessSpectrum mie_i;
    ComputeSingleScatteringIntegrand(atmosphere, transmittance_texture,
        r, mu, mu_s, nu, d_i, ray_r_mu_intersects_ground, rayleigh_i, mie_i);
    // Sample weight (from the trapezoidal rule).
    Number weight_i = (i == 0 || i == SAMPLE_COUNT) ? 0.5 : 1.0;
    rayleigh_sum += rayleigh_i * weight_i;
    mie_sum += mie_i * weight_i;
  }
  rayleigh = rayleigh_sum * dx * atmosphere.solar_irradiance *
      atmosphere.rayleigh_scattering;
  mie = mie_sum * dx * atmosphere.solar_irradiance * atmosphere.mie_scattering;
}

void GetRMuMuSNuFromScatteringTextureUvwz(const AtmosphereParameters atmosphere,
    const vec4 uvwz, out Length r, out Number mu, out Number mu_s,
    out Number nu, out bool ray_r_mu_intersects_ground) {
  assert(uvwz.x >= 0.0 && uvwz.x <= 1.0);
  assert(uvwz.y >= 0.0 && uvwz.y <= 1.0);
  assert(uvwz.z >= 0.0 && uvwz.z <= 1.0);
  assert(uvwz.w >= 0.0 && uvwz.w <= 1.0);

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  Length H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius);
  // Distance to the horizon.
  Length rho =
      H * GetUnitRangeFromTextureCoord(uvwz.w, SCATTERING_TEXTURE_R_SIZE);
  r = sqrt(rho * rho + atmosphere.bottom_radius * atmosphere.bottom_radius);

  if (uvwz.z < 0.5) {
    // Distance to the ground for the ray (r,mu), and its minimum and maximum
    // values over all mu - obtained for (r,-1) and (r,mu_horizon) - from which
    // we can recover mu:
    Length d_min = r - atmosphere.bottom_radius;
    Length d_max = rho;
    Length d = d_min + (d_max - d_min) * GetUnitRangeFromTextureCoord(
        1.0 - 2.0 * uvwz.z, SCATTERING_TEXTURE_MU_SIZE / 2);
    mu = d == 0.0 * m ? Number(-1.0) :
        ClampCosine(-(rho * rho + d * d) / (2.0 * r * d));
    ray_r_mu_intersects_ground = true;
  } else {
    // Distance to the top atmosphere boundary for the ray (r,mu), and its
    // minimum and maximum values over all mu - obtained for (r,1) and
    // (r,mu_horizon) - from which we can recover mu:
    Length d_min = atmosphere.top_radius - r;
    Length d_max = rho + H;
    Length d = d_min + (d_max - d_min) * GetUnitRangeFromTextureCoord(
        2.0 * uvwz.z - 1.0, SCATTERING_TEXTURE_MU_SIZE / 2);
    mu = d == 0.0 * m ? Number(1.0) :
        ClampCosine((H * H - rho * rho - d * d) / (2.0 * r * d));
    ray_r_mu_intersects_ground = false;
  }

  Number x_mu_s =
      GetUnitRangeFromTextureCoord(uvwz.y, SCATTERING_TEXTURE_MU_S_SIZE);
  Length d_min = atmosphere.top_radius - atmosphere.bottom_radius;
  Length d_max = H;
  Length D = DistanceToTopAtmosphereBoundary(
      atmosphere, atmosphere.bottom_radius, atmosphere.mu_s_min);
  Number A = (D - d_min) / (d_max - d_min);
  Number a = (A - x_mu_s * A) / (1.0 + x_mu_s * A);
  Length d = d_min + min(a, A) * (d_max - d_min);
  mu_s = d == 0.0 * m ? Number(1.0) :
     ClampCosine((H * H - d * d) / (2.0 * atmosphere.bottom_radius * d));

  nu = ClampCosine(uvwz.x * 2.0 - 1.0);
}

void GetRMuMuSNuFromScatteringTextureFragCoord(
    const AtmosphereParameters atmosphere, const vec3 frag_coord,
    out Length r, out Number mu, out Number mu_s, out Number nu,
    out bool ray_r_mu_intersects_ground) {
  const vec4 SCATTERING_TEXTURE_SIZE = vec4(
      SCATTERING_TEXTURE_NU_SIZE - 1,
      SCATTERING_TEXTURE_MU_S_SIZE,
      SCATTERING_TEXTURE_MU_SIZE,
      SCATTERING_TEXTURE_R_SIZE);
  Number frag_coord_nu =
      floor(frag_coord.x / Number(SCATTERING_TEXTURE_MU_S_SIZE));
  Number frag_coord_mu_s =
      mod(frag_coord.x, Number(SCATTERING_TEXTURE_MU_S_SIZE));
  vec4 uvwz =
      vec4(frag_coord_nu, frag_coord_mu_s, frag_coord.y, frag_coord.z) /
          SCATTERING_TEXTURE_SIZE;
  GetRMuMuSNuFromScatteringTextureUvwz(
      atmosphere, uvwz, r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  // Clamp nu to its valid range of values, given mu and mu_s.
  nu = clamp(nu, mu * mu_s - sqrt((1.0 - mu * mu) * (1.0 - mu_s * mu_s)),
      mu * mu_s + sqrt((1.0 - mu * mu) * (1.0 - mu_s * mu_s)));
}

void ComputeSingleScatteringTexture(const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture, const vec3 frag_coord,
    out IrradianceSpectrum rayleigh, out IrradianceSpectrum mie) {
  Length r;
  Number mu;
  Number mu_s;
  Number nu;
  bool ray_r_mu_intersects_ground;
  GetRMuMuSNuFromScatteringTextureFragCoord(atmosphere, frag_coord,
      r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  ComputeSingleScattering(atmosphere, transmittance_texture,
      r, mu, mu_s, nu, ray_r_mu_intersects_ground, rayleigh, mie);
}

AbstractSpectrum GetScattering(
    const AtmosphereParameters atmosphere,
    const AbstractScatteringTexture scattering_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const bool ray_r_mu_intersects_ground) {
  vec4 uvwz = GetScatteringTextureUvwzFromRMuMuSNu(
      atmosphere, r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  Number tex_coord_x = uvwz.x * Number(SCATTERING_TEXTURE_NU_SIZE - 1);
  Number tex_x = floor(tex_coord_x);
  Number lerp = tex_coord_x - tex_x;
  vec3 uvw0 = vec3((tex_x + uvwz.y) / Number(SCATTERING_TEXTURE_NU_SIZE),
      uvwz.z, uvwz.w);
  vec3 uvw1 = vec3((tex_x + 1.0 + uvwz.y) / Number(SCATTERING_TEXTURE_NU_SIZE),
      uvwz.z, uvwz.w);
  return AbstractSpectrum(texture(scattering_texture, uvw0) * (1.0 - lerp) +
      texture(scattering_texture, uvw1) * lerp);
}

RadianceSpectrum GetScattering(
    const AtmosphereParameters atmosphere,
    const ReducedScatteringTexture single_rayleigh_scattering_texture,
    const ReducedScatteringTexture single_mie_scattering_texture,
    const ScatteringTexture multiple_scattering_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const bool ray_r_mu_intersects_ground,
    const int scattering_order) {
  if (scattering_order == 1) {
    IrradianceSpectrum rayleigh = GetScattering(
        atmosphere, single_rayleigh_scattering_texture, r, mu, mu_s, nu,
        ray_r_mu_intersects_ground);
    IrradianceSpectrum mie = GetScattering(
        atmosphere, single_mie_scattering_texture, r, mu, mu_s, nu,
        ray_r_mu_intersects_ground);
    return rayleigh * RayleighPhaseFunction(nu) +
        mie * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
  } else {
    return GetScattering(
        atmosphere, multiple_scattering_texture, r, mu, mu_s, nu,
        ray_r_mu_intersects_ground);
  }
}

IrradianceSpectrum GetIrradiance(
    const AtmosphereParameters atmosphere,
    const IrradianceTexture irradiance_texture,
    const Length r, const Number mu_s);

RadianceDensitySpectrum ComputeScatteringDensity(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const ReducedScatteringTexture single_rayleigh_scattering_texture,
    const ReducedScatteringTexture single_mie_scattering_texture,
    const ScatteringTexture multiple_scattering_texture,
    const IrradianceTexture irradiance_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const int scattering_order) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu >= -1.0 && mu <= 1.0);
  assert(mu_s >= -1.0 && mu_s <= 1.0);
  assert(nu >= -1.0 && nu <= 1.0);
  assert(scattering_order >= 2);

  // Compute unit direction vectors for the zenith, the view direction omega and
  // and the sun direction omega_s, such that the cosine of the view-zenith
  // angle is mu, the cosine of the sun-zenith angle is mu_s, and the cosine of
  // the view-sun angle is nu. The goal is to simplify computations below.
  vec3 zenith_direction = vec3(0.0, 0.0, 1.0);
  vec3 omega = vec3(sqrt(1.0 - mu * mu), 0.0, mu);
  Number sun_dir_x = omega.x == 0.0 ? 0.0 : (nu - mu * mu_s) / omega.x;
  Number sun_dir_y = sqrt(max(1.0 - sun_dir_x * sun_dir_x - mu_s * mu_s, 0.0));
  vec3 omega_s = vec3(sun_dir_x, sun_dir_y, mu_s);

  const int SAMPLE_COUNT = 16;
  const Angle dphi = pi / Number(SAMPLE_COUNT);
  const Angle dtheta = pi / Number(SAMPLE_COUNT);
  RadianceDensitySpectrum rayleigh_mie =
      RadianceDensitySpectrum(0.0 * watt_per_cubic_meter_per_sr_per_nm);

  // Nested loops for the integral over all the incident directions omega_i.
  for (int l = 0; l < SAMPLE_COUNT; ++l) {
    Angle theta = (Number(l) + 0.5) * dtheta;
    Number cos_theta = cos(theta);
    Number sin_theta = sin(theta);
    bool ray_r_theta_intersects_ground =
        RayIntersectsGround(atmosphere, r, cos_theta);

    // The distance and transmittance to the ground only depend on theta, so we
    // can compute them in the outer loop for efficiency.
    Length distance_to_ground = 0.0 * m;
    DimensionlessSpectrum transmittance_to_ground = DimensionlessSpectrum(0.0);
    DimensionlessSpectrum ground_albedo = DimensionlessSpectrum(0.0);
    if (ray_r_theta_intersects_ground) {
      distance_to_ground =
          DistanceToBottomAtmosphereBoundary(atmosphere, r, cos_theta);
      transmittance_to_ground =
          GetTransmittance(atmosphere, transmittance_texture, r, cos_theta,
              distance_to_ground, true /* ray_intersects_ground */);
      ground_albedo = atmosphere.ground_albedo;
    }

    for (int m = 0; m < 2 * SAMPLE_COUNT; ++m) {
      Angle phi = (Number(m) + 0.5) * dphi;
      vec3 omega_i =
          vec3(cos(phi) * sin_theta, sin(phi) * sin_theta, cos_theta);
      SolidAngle domega_i = (dtheta / rad) * (dphi / rad) * sin(theta) * sr;

      // The radiance L_i arriving from direction omega_i after n-1 bounces is
      // the sum of a term given by the precomputed scattering texture for the
      // (n-1)-th order:
      Number nu1 = dot(omega_s, omega_i);
      RadianceSpectrum incident_radiance = GetScattering(atmosphere,
          single_rayleigh_scattering_texture, single_mie_scattering_texture,
          multiple_scattering_texture, r, omega_i.z, mu_s, nu1,
          ray_r_theta_intersects_ground, scattering_order - 1);

      // and of the contribution from the light paths with n-1 bounces and whose
      // last bounce is on the ground. This contribution is the product of the
      // transmittance to the ground, the ground albedo, the ground BRDF, and
      // the irradiance received on the ground after n-2 bounces.
      vec3 ground_normal =
          normalize(zenith_direction * r + omega_i * distance_to_ground);
      IrradianceSpectrum ground_irradiance = GetIrradiance(
          atmosphere, irradiance_texture, atmosphere.bottom_radius,
          dot(ground_normal, omega_s));
      incident_radiance += transmittance_to_ground *
          ground_albedo * (1.0 / (PI * sr)) * ground_irradiance;

      // The radiance finally scattered from direction omega_i towards direction
      // -omega is the product of the incident radiance, the scattering
      // coefficient, and the phase function for directions omega and omega_i
      // (all this summed over all particle types, i.e. Rayleigh and Mie).
      Number nu2 = dot(omega, omega_i);
      Number rayleigh_density = GetProfileDensity(
          atmosphere.rayleigh_density, r - atmosphere.bottom_radius);
      Number mie_density = GetProfileDensity(
          atmosphere.mie_density, r - atmosphere.bottom_radius);
      rayleigh_mie += incident_radiance * (
          atmosphere.rayleigh_scattering * rayleigh_density *
              RayleighPhaseFunction(nu2) +
          atmosphere.mie_scattering * mie_density *
              MiePhaseFunction(atmosphere.mie_phase_function_g, nu2)) *
          domega_i;
    }
  }
  return rayleigh_mie;
}

RadianceSpectrum ComputeMultipleScattering(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const ScatteringDensityTexture scattering_density_texture,
    const Length r, const Number mu, const Number mu_s, const Number nu,
    const bool ray_r_mu_intersects_ground) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu >= -1.0 && mu <= 1.0);
  assert(mu_s >= -1.0 && mu_s <= 1.0);
  assert(nu >= -1.0 && nu <= 1.0);

  // Number of intervals for the numerical integration.
  const int SAMPLE_COUNT = 50;
  // The integration step, i.e. the length of each integration interval.
  Length dx =
      DistanceToNearestAtmosphereBoundary(
          atmosphere, r, mu, ray_r_mu_intersects_ground) /
              Number(SAMPLE_COUNT);
  // Integration loop.
  RadianceSpectrum rayleigh_mie_sum =
      RadianceSpectrum(0.0 * watt_per_square_meter_per_sr_per_nm);
  for (int i = 0; i <= SAMPLE_COUNT; ++i) {
    Length d_i = Number(i) * dx;

    // The r, mu and mu_s parameters at the current integration point (see the
    // single scattering section for a detailed explanation).
    Length r_i =
        ClampRadius(atmosphere, sqrt(d_i * d_i + 2.0 * r * mu * d_i + r * r));
    Number mu_i = ClampCosine((r * mu + d_i) / r_i);
    Number mu_s_i = ClampCosine((r * mu_s + d_i * nu) / r_i);

    // The Rayleigh and Mie multiple scattering at the current sample point.
    RadianceSpectrum rayleigh_mie_i =
        GetScattering(
            atmosphere, scattering_density_texture, r_i, mu_i, mu_s_i, nu,
            ray_r_mu_intersects_ground) *
        GetTransmittance(
            atmosphere, transmittance_texture, r, mu, d_i,
            ray_r_mu_intersects_ground) *
        dx;
    // Sample weight (from the trapezoidal rule).
    Number weight_i = (i == 0 || i == SAMPLE_COUNT) ? 0.5 : 1.0;
    rayleigh_mie_sum += rayleigh_mie_i * weight_i;
  }
  return rayleigh_mie_sum;
}

RadianceDensitySpectrum ComputeScatteringDensityTexture(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const ReducedScatteringTexture single_rayleigh_scattering_texture,
    const ReducedScatteringTexture single_mie_scattering_texture,
    const ScatteringTexture multiple_scattering_texture,
    const IrradianceTexture irradiance_texture,
    const vec3 frag_coord, const int scattering_order) {
  Length r;
  Number mu;
  Number mu_s;
  Number nu;
  bool ray_r_mu_intersects_ground;
  GetRMuMuSNuFromScatteringTextureFragCoord(atmosphere, frag_coord,
      r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  return ComputeScatteringDensity(atmosphere, transmittance_texture,
      single_rayleigh_scattering_texture, single_mie_scattering_texture,
      multiple_scattering_texture, irradiance_texture, r, mu, mu_s, nu,
      scattering_order);
}

RadianceSpectrum ComputeMultipleScatteringTexture(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const ScatteringDensityTexture scattering_density_texture,
    const vec3 frag_coord, out Number nu) {
  Length r;
  Number mu;
  Number mu_s;
  bool ray_r_mu_intersects_ground;
  GetRMuMuSNuFromScatteringTextureFragCoord(atmosphere, frag_coord,
      r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  return ComputeMultipleScattering(atmosphere, transmittance_texture,
      scattering_density_texture, r, mu, mu_s, nu,
      ray_r_mu_intersects_ground);
}

IrradianceSpectrum ComputeDirectIrradiance(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const Length r, const Number mu_s) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu_s >= -1.0 && mu_s <= 1.0);

  Number alpha_s = atmosphere.sun_angular_radius / rad;
  // Approximate average of the cosine factor mu_s over the visible fraction of
  // the Sun disc.
  Number average_cosine_factor =
    mu_s < -alpha_s ? 0.0 : (mu_s > alpha_s ? mu_s :
        (mu_s + alpha_s) * (mu_s + alpha_s) / (4.0 * alpha_s));

  return atmosphere.solar_irradiance *
      GetTransmittanceToTopAtmosphereBoundary(
          atmosphere, transmittance_texture, r, mu_s) * average_cosine_factor;

}

IrradianceSpectrum ComputeIndirectIrradiance(
    const AtmosphereParameters atmosphere,
    const ReducedScatteringTexture single_rayleigh_scattering_texture,
    const ReducedScatteringTexture single_mie_scattering_texture,
    const ScatteringTexture multiple_scattering_texture,
    const Length r, const Number mu_s, const int scattering_order) {
  assert(r >= atmosphere.bottom_radius && r <= atmosphere.top_radius);
  assert(mu_s >= -1.0 && mu_s <= 1.0);
  assert(scattering_order >= 1);

  const int SAMPLE_COUNT = 32;
  const Angle dphi = pi / Number(SAMPLE_COUNT);
  const Angle dtheta = pi / Number(SAMPLE_COUNT);

  IrradianceSpectrum result =
      IrradianceSpectrum(0.0 * watt_per_square_meter_per_nm);
  vec3 omega_s = vec3(sqrt(1.0 - mu_s * mu_s), 0.0, mu_s);
  for (int j = 0; j < SAMPLE_COUNT / 2; ++j) {
    Angle theta = (Number(j) + 0.5) * dtheta;
    for (int i = 0; i < 2 * SAMPLE_COUNT; ++i) {
      Angle phi = (Number(i) + 0.5) * dphi;
      vec3 omega =
          vec3(cos(phi) * sin(theta), sin(phi) * sin(theta), cos(theta));
      SolidAngle domega = (dtheta / rad) * (dphi / rad) * sin(theta) * sr;

      Number nu = dot(omega, omega_s);
      result += GetScattering(atmosphere, single_rayleigh_scattering_texture,
          single_mie_scattering_texture, multiple_scattering_texture,
          r, omega.z, mu_s, nu, false /* ray_r_theta_intersects_ground */,
          scattering_order) *
              omega.z * domega;
    }
  }
  return result;
}

void GetRMuSFromIrradianceTextureUv(const AtmosphereParameters atmosphere,
    const vec2 uv, out Length r, out Number mu_s) {
  assert(uv.x >= 0.0 && uv.x <= 1.0);
  assert(uv.y >= 0.0 && uv.y <= 1.0);
  Number x_mu_s = GetUnitRangeFromTextureCoord(uv.x, IRRADIANCE_TEXTURE_WIDTH);
  Number x_r = GetUnitRangeFromTextureCoord(uv.y, IRRADIANCE_TEXTURE_HEIGHT);
  r = atmosphere.bottom_radius +
      x_r * (atmosphere.top_radius - atmosphere.bottom_radius);
  mu_s = ClampCosine(2.0 * x_mu_s - 1.0);
}

const vec2 IRRADIANCE_TEXTURE_SIZE =
    vec2(IRRADIANCE_TEXTURE_WIDTH, IRRADIANCE_TEXTURE_HEIGHT);

IrradianceSpectrum ComputeDirectIrradianceTexture(
    const AtmosphereParameters atmosphere,
    const TransmittanceTexture transmittance_texture,
    const vec2 frag_coord) {
  Length r;
  Number mu_s;
  GetRMuSFromIrradianceTextureUv(
      atmosphere, frag_coord / IRRADIANCE_TEXTURE_SIZE, r, mu_s);
  return ComputeDirectIrradiance(atmosphere, transmittance_texture, r, mu_s);
}

IrradianceSpectrum ComputeIndirectIrradianceTexture(
    const AtmosphereParameters atmosphere,
    const ReducedScatteringTexture single_rayleigh_scattering_texture,
    const ReducedScatteringTexture single_mie_scattering_texture,
    const ScatteringTexture multiple_scattering_texture,
    const vec2 frag_coord, const int scattering_order) {
  Length r;
  Number mu_s;
  GetRMuSFromIrradianceTextureUv(
      atmosphere, frag_coord / IRRADIANCE_TEXTURE_SIZE, r, mu_s);
  return ComputeIndirectIrradiance(atmosphere,
      single_rayleigh_scattering_texture, single_mie_scattering_texture,
      multiple_scattering_texture, r, mu_s, scattering_order);
}
