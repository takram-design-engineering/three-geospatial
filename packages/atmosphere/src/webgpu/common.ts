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

import {
  add,
  clamp,
  div,
  exp,
  float,
  floor,
  fract,
  If,
  max,
  min,
  mix,
  mul,
  PI,
  pow,
  remap,
  select,
  smoothstep,
  sqrt,
  sub,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { Fnv } from '@takram/three-geospatial/webgpu'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_NU_SIZE,
  SCATTERING_TEXTURE_R_SIZE,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from '../constants'
import type {
  AbstractScatteringTexture,
  AbstractSpectrum,
  Area,
  AtmosphereParams,
  Bool,
  DimensionlessSpectrum,
  Float,
  InverseSolidAngle,
  IrradianceSpectrum,
  IrradianceTexture,
  Length,
  TransmittanceTexture,
  Vec2,
  Vec4
} from './definitions'

export const clampCosine = /*#__PURE__*/ Fnv((cosine: Float): Float => {
  return clamp(cosine, -1, 1)
})

export const clampDistance = /*#__PURE__*/ Fnv((distance: Length): Length => {
  return max(distance, 0)
})

export const clampRadius = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length): Length => {
    return clamp(radius, atmosphere.bottomRadius, atmosphere.topRadius)
  }
)

export const safeSqrt = /*#__PURE__*/ Fnv((area: Area): Length => {
  return sqrt(max(area, 0))
})

export const distanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosView: Float): Length => {
    const discriminant = radius
      .mul(radius)
      .mul(cosView.pow2().sub(1))
      .add(atmosphere.topRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosView).add(safeSqrt(discriminant))
    )
  }
)

export const distanceToBottomAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosView: Float): Length => {
    const discriminant = radius
      .pow2()
      .mul(cosView.pow2().sub(1))
      .add(atmosphere.bottomRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosView).sub(safeSqrt(discriminant))
    )
  }
)

export const rayIntersectsGround = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosView: Float): Bool => {
    return cosView
      .lessThan(0)
      .and(
        radius
          .pow2()
          .mul(cosView.pow2().sub(1))
          .add(atmosphere.bottomRadius.pow2())
          .greaterThanEqual(0)
      )
  }
)

export const getTextureCoordFromUnitRange = /*#__PURE__*/ Fnv(
  (unit: Float, textureSize: Float): Float => {
    return div(0.5, textureSize).add(
      unit.mul(textureSize.reciprocal().oneMinus())
    )
  }
)

export const getTransmittanceTextureUV = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosView: Float): Vec2 => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      atmosphere.topRadius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon for the view.
    const distanceToHorizon = safeSqrt(
      radius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon).
    const distanceToTop = distanceToTopAtmosphereBoundary(
      atmosphere,
      radius,
      cosView
    )
    const minDistance = atmosphere.topRadius.sub(radius).toVar()
    const maxDistance = distanceToHorizon.add(H)
    const cosViewUnit = remap(distanceToTop, minDistance, maxDistance)
    const radiusUnit = distanceToHorizon.div(H)

    return vec2(
      getTextureCoordFromUnitRange(cosViewUnit, TRANSMITTANCE_TEXTURE_WIDTH),
      getTextureCoordFromUnitRange(radiusUnit, TRANSMITTANCE_TEXTURE_HEIGHT)
    )
  }
)

export const getTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosView: Float
  ): DimensionlessSpectrum => {
    const uv = getTransmittanceTextureUV(atmosphere, radius, cosView)

    // Added for the precomputation stage in half-float precision. Manually
    // interpolate the transmittance instead of the optical depth.
    if (atmosphere.options.transmittancePrecisionLog) {
      // TODO: Separate to sampleLinear() function.
      const size = vec2(
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT
      ).toConst()
      const texelSize = vec3(div(1, size), 0).toConst()
      const coord = uv.mul(size).sub(0.5).toVar()
      const i = floor(coord).add(0.5).mul(texelSize.xy).toVar()
      const f = fract(coord).toVar()
      const t1 = exp(transmittanceTexture.sample(i).negate())
      const t2 = exp(transmittanceTexture.sample(i.add(texelSize.xz)).negate())
      const t3 = exp(transmittanceTexture.sample(i.add(texelSize.zy)).negate())
      const t4 = exp(transmittanceTexture.sample(i.add(texelSize.xy)).negate())
      return mix(mix(t1, t2, f.x), mix(t3, t4, f.x), f.y).rgb
    } else {
      return transmittanceTexture.sample(uv).rgb
    }
  }
)

export const getTransmittance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosView: Float,
    rayLength: Length,
    rayIntersectsGround: Bool
  ): DimensionlessSpectrum => {
    const radiusEnd = clampRadius(
      atmosphere,
      sqrt(
        rayLength
          .mul(rayLength)
          .add(mul(2, radius).mul(cosView).mul(rayLength))
          .add(radius.pow2())
      )
    ).toVar()
    const cosViewEnd = clampCosine(
      radius.mul(cosView).add(rayLength).div(radiusEnd)
    ).toVar()

    const result = vec3().toVar()
    If(rayIntersectsGround, () => {
      result.assign(
        min(
          getTransmittanceToTopAtmosphereBoundary(
            atmosphere,
            transmittanceTexture,
            radiusEnd,
            cosViewEnd.negate()
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              atmosphere,
              transmittanceTexture,
              radius,
              cosView.negate()
            )
          ),
          vec3(1)
        )
      )
    }).Else(() => {
      result.assign(
        min(
          getTransmittanceToTopAtmosphereBoundary(
            atmosphere,
            transmittanceTexture,
            radius,
            cosView
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              atmosphere,
              transmittanceTexture,
              radiusEnd,
              cosViewEnd
            )
          ),
          vec3(1)
        )
      )
    })
    return result
  }
)

export const getTransmittanceToSun = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosSun: Float
  ): DimensionlessSpectrum => {
    const sinHorizon = atmosphere.bottomRadius.div(radius).toVar()
    const cosHorizon = sqrt(max(sub(1, sinHorizon.mul(sinHorizon)), 0)).negate()
    return getTransmittanceToTopAtmosphereBoundary(
      atmosphere,
      transmittanceTexture,
      radius,
      cosSun
    ).mul(
      smoothstep(
        sinHorizon.negate().mul(atmosphere.sunAngularRadius),
        sinHorizon.mul(atmosphere.sunAngularRadius),
        cosSun.sub(cosHorizon)
      )
    )
  }
)

// Rayleigh phase function:
// p(\theta) = \frac{3}{16\pi}(1+\cos^2\theta)
export const rayleighPhaseFunction = /*#__PURE__*/ Fnv(
  (cosViewSun: Float): InverseSolidAngle => {
    const k = div(3, mul(16, PI))
    return k.mul(add(1, cosViewSun.pow2()))
  }
)

// Cornette-Shanks phase function:
// p(g,\theta) = \frac{3}{8\pi}\frac{(1-g^2)(1+\cos^2\theta)}{(2+g^2)(1+g^2-2g\cos\theta)^{3/2}}
export const miePhaseFunction = /*#__PURE__*/ Fnv(
  (g: Float, cosViewSun: Float): InverseSolidAngle => {
    const k = div(3, mul(8, PI)).mul(g.pow2().oneMinus()).div(add(2, g.pow2()))
    return k
      .mul(add(1, cosViewSun.pow2()))
      .div(pow(add(1, g.pow2().sub(mul(2, g).mul(cosViewSun))), 1.5))
  }
)

export const getScatteringTextureCoord = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    radius: Length,
    cosView: Float,
    cosSun: Float,
    cosViewSun: Float,
    viewRayIntersectsGround: Bool
  ): Vec4 => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      atmosphere.topRadius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon for the view.
    const distanceToHorizon = safeSqrt(
      radius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    const radiusCoord = getTextureCoordFromUnitRange(
      distanceToHorizon.div(H),
      SCATTERING_TEXTURE_R_SIZE
    )

    // Discriminant of the quadratic equation for the intersections of the ray
    // (radius, cosView) with the ground (see rayIntersectsGround).
    const radiusCosView = radius.mul(cosView).toVar()
    const discriminant = radiusCosView
      .pow2()
      .sub(radius.pow2())
      .add(atmosphere.bottomRadius.pow2())
      .toVar()

    const cosViewCoord = float().toVar()
    If(viewRayIntersectsGround, () => {
      // Distance to the ground for the ray (radius, cosView), and its minimum
      // and maximum values over all cosView - obtained for (radius, -1) and
      // (radius, cosHorizon).
      const distance = radiusCosView.negate().sub(safeSqrt(discriminant))
      const minDistance = radius.sub(atmosphere.bottomRadius).toVar()
      const maxDistance = distanceToHorizon.toVar()
      cosViewCoord.assign(
        sub(
          0.5,
          getTextureCoordFromUnitRange(
            select(
              maxDistance.equal(minDistance),
              0,
              remap(distance, minDistance, maxDistance)
            ),
            SCATTERING_TEXTURE_MU_SIZE / 2
          ).mul(0.5)
        )
      )
    }).Else(() => {
      // Distance to the top atmosphere boundary for the ray (radius, cosView),
      // and its minimum and maximum values over all cosView - obtained for
      // (radius, 1) and (radius, cosHorizon).
      const distance = radiusCosView
        .negate()
        .add(safeSqrt(discriminant.add(H.pow2())))
      const minDistance = atmosphere.topRadius.sub(radius).toVar()
      const maxDistance = distanceToHorizon.add(H)
      cosViewCoord.assign(
        add(
          0.5,
          getTextureCoordFromUnitRange(
            remap(distance, minDistance, maxDistance),
            SCATTERING_TEXTURE_MU_SIZE / 2
          ).mul(0.5)
        )
      )
    })

    const minDistance = atmosphere.topRadius
      .sub(atmosphere.bottomRadius)
      .toVar()
    const maxDistance = H
    const d = distanceToTopAtmosphereBoundary(
      atmosphere,
      atmosphere.bottomRadius,
      cosSun
    )
    const a = remap(d, minDistance, maxDistance).toVar()
    const D = distanceToTopAtmosphereBoundary(
      atmosphere,
      atmosphere.bottomRadius,
      atmosphere.minCosSun
    )
    const A = remap(D, minDistance, maxDistance)

    // An ad-hoc function equal to 0 for cosSun = minCosSun (because then
    // d = D and thus a = A), equal to 1 for cosSun = 1 (because then d =
    // minDistance and thus a = 0), and with a large slope around cosSun = 0, to
    // get more texture samples near the horizon.
    const cosSunCoord = getTextureCoordFromUnitRange(
      max(sub(1, a.div(A)), 0).div(add(1, a)),
      SCATTERING_TEXTURE_MU_S_SIZE
    )
    const cosViewSunCoord = cosViewSun.add(1).div(2)

    return vec4(cosViewSunCoord, cosSunCoord, cosViewCoord, radiusCoord)
  }
)

export const getScattering = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    scatteringTexture: AbstractScatteringTexture,
    radius: Length,
    cosView: Float,
    cosSun: Float,
    cosViewSun: Float,
    rayIntersectsGround: Bool
  ): AbstractSpectrum => {
    const coord = getScatteringTextureCoord(
      atmosphere,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    ).toVar()
    const texCoordX = coord.x.mul(SCATTERING_TEXTURE_NU_SIZE - 1).toVar()
    const texX = floor(texCoordX).toVar()
    const lerp = texCoordX.sub(texX).toVar()
    const coord0 = vec3(
      texX.add(coord.y).div(SCATTERING_TEXTURE_NU_SIZE),
      coord.z,
      coord.w
    )
    const coord1 = vec3(
      texX.add(1).add(coord.y).div(SCATTERING_TEXTURE_NU_SIZE),
      coord.z,
      coord.w
    )
    return scatteringTexture
      .sample(coord0)
      .mul(lerp.oneMinus())
      .add(scatteringTexture.sample(coord1).mul(lerp)).rgb
  }
)

export const getIrradianceTextureUV = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosSun: Float): Vec2 => {
    const radiusUnit = remap(
      radius,
      atmosphere.bottomRadius,
      atmosphere.topRadius
    )
    const cosSunUnit = cosSun.mul(0.5).add(0.5)
    return vec2(
      getTextureCoordFromUnitRange(cosSunUnit, IRRADIANCE_TEXTURE_WIDTH),
      getTextureCoordFromUnitRange(radiusUnit, IRRADIANCE_TEXTURE_HEIGHT)
    )
  }
)

export const getIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    irradianceTexture: IrradianceTexture,
    radius: Length,
    cosSun: Float
  ): IrradianceSpectrum => {
    const uv = getIrradianceTextureUV(atmosphere, radius, cosSun)
    return irradianceTexture.sample(uv).rgb
  }
)
