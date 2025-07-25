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
  SCATTERING_TEXTURE_R_SIZE,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from '../constants'
import type {
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

// Symbol table:
// | Here       | Bruneton | Description                 |
// | ---------- | -------- | --------------------------- |
// | cos(alpha) | mu       | Cosine of view-zenith angle |
// | cos(phi)   | mu_s     | Cosine of sun-zenith angle  |
// | cos(theta) | nu       | Cosine of view-sun angle    |

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
  (atmosphere: AtmosphereParams, radius: Length, cosAlpha: Float): Length => {
    const discriminant = radius
      .mul(radius)
      .mul(cosAlpha.pow2().sub(1))
      .add(atmosphere.topRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosAlpha).add(safeSqrt(discriminant))
    )
  }
)

export const distanceToBottomAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosAlpha: Float): Length => {
    const discriminant = radius
      .pow2()
      .mul(cosAlpha.pow2().sub(1))
      .add(atmosphere.bottomRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosAlpha).sub(safeSqrt(discriminant))
    )
  }
)

export const rayIntersectsGround = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosAlpha: Float): Bool => {
    return cosAlpha
      .lessThan(0)
      .and(
        radius
          .pow2()
          .mul(cosAlpha.pow2().sub(1))
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

export const getTransmittanceTextureUv = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosAlpha: Float): Vec2 => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      atmosphere.topRadius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon for the view.
    const distanceToHorizon = safeSqrt(
      radius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the top atmosphere boundary for the ray (r, mu), and its
    // minimum and maximum values over all mu - obtained for (r, 1) and
    // (r, mu_horizon).
    const distanceToTop = distanceToTopAtmosphereBoundary(
      atmosphere,
      radius,
      cosAlpha
    )
    const minDistance = atmosphere.topRadius.sub(radius).toVar()
    const maxDistance = distanceToHorizon.add(H)
    const cosAlphaUnit = remap(distanceToTop, minDistance, maxDistance)
    const radiusUnit = distanceToHorizon.div(H)

    return vec2(
      getTextureCoordFromUnitRange(cosAlphaUnit, TRANSMITTANCE_TEXTURE_WIDTH),
      getTextureCoordFromUnitRange(radiusUnit, TRANSMITTANCE_TEXTURE_HEIGHT)
    )
  }
)

export const getTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosAlpha: Float,
    storeOpticalDepth: boolean
  ): DimensionlessSpectrum => {
    const uv = getTransmittanceTextureUv(atmosphere, radius, cosAlpha)

    // Added for the precomputation stage in half-float precision. Manually
    // interpolate the transmittance instead of the optical depth.
    if (storeOpticalDepth) {
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
    cosAlpha: Float,
    rayLength: Length,
    rayIntersectsGround: Bool,
    storeOpticalDepth: boolean
  ): DimensionlessSpectrum => {
    const radiusEnd = clampRadius(
      atmosphere,
      sqrt(
        rayLength
          .mul(rayLength)
          .add(mul(2, radius).mul(cosAlpha).mul(rayLength))
          .add(radius.pow2())
      )
    ).toVar()
    const cosAlphaEnd = clampCosine(
      radius.mul(cosAlpha).add(rayLength).div(radiusEnd)
    ).toVar()

    const result = vec3().toVar()
    If(rayIntersectsGround, () => {
      result.assign(
        min(
          getTransmittanceToTopAtmosphereBoundary(
            atmosphere,
            transmittanceTexture,
            radiusEnd,
            cosAlphaEnd.negate(),
            storeOpticalDepth
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              atmosphere,
              transmittanceTexture,
              radius,
              cosAlpha.negate(),
              storeOpticalDepth
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
            cosAlpha,
            storeOpticalDepth
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              atmosphere,
              transmittanceTexture,
              radiusEnd,
              cosAlphaEnd,
              storeOpticalDepth
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
    cosPhi: Float,
    storeOpticalDepth: boolean
  ): DimensionlessSpectrum => {
    const sinHorizon = atmosphere.bottomRadius.div(radius).toVar()
    const cosHorizon = sqrt(max(sub(1, sinHorizon.mul(sinHorizon)), 0)).negate()
    return getTransmittanceToTopAtmosphereBoundary(
      atmosphere,
      transmittanceTexture,
      radius,
      cosPhi,
      storeOpticalDepth
    ).mul(
      smoothstep(
        sinHorizon.negate().mul(atmosphere.sunAngularRadius),
        sinHorizon.mul(atmosphere.sunAngularRadius),
        cosPhi.sub(cosHorizon)
      )
    )
  }
)

// Rayleigh phase function:
// p(\theta) = \frac{3}{16\pi}(1+\cos^2\theta)
export const rayleighPhaseFunction = /*#__PURE__*/ Fnv(
  (cosTheta: Float): InverseSolidAngle => {
    const k = div(3, mul(16, PI))
    return k.mul(add(1, cosTheta.pow2()))
  }
)

// Cornette-Shanks phase function:
// p(g,\theta) = \frac{3}{8\pi}\frac{(1-g^2)(1+\cos^2\theta)}{(2+g^2)(1+g^2-2g\cos\theta)^{3/2}}
export const miePhaseFunction = /*#__PURE__*/ Fnv(
  (g: Float, cosTheta: Float): InverseSolidAngle => {
    const k = div(3, mul(8, PI)).mul(g.pow2().oneMinus()).div(add(2, g.pow2()))
    return k
      .mul(add(1, cosTheta.pow2()))
      .div(pow(add(1, g.pow2().sub(mul(2, g).mul(cosTheta))), 1.5))
  }
)

export const getScatteringTextureCoord = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
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
    // (r,mu) with the ground (see rayIntersectsGround).
    const radiusCosAlpha = radius.mul(cosAlpha).toVar()
    const discriminant = radiusCosAlpha
      .pow2()
      .sub(radius.pow2())
      .add(atmosphere.bottomRadius.pow2())
      .toVar()

    const cosAlphaCoord = float().toVar()
    If(viewRayIntersectsGround, () => {
      // Distance to the ground for the ray (r,mu), and its minimum and maximum
      // values over all mu - obtained for (r,-1) and (r,mu_horizon).
      const distance = radiusCosAlpha.negate().sub(safeSqrt(discriminant))
      const minDistance = radius.sub(atmosphere.bottomRadius).toVar()
      const maxDistance = distanceToHorizon.toVar()
      cosAlphaCoord.assign(
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
      // Distance to the top atmosphere boundary for the ray (r,mu), and its
      // minimum and maximum values over all mu - obtained for (r,1) and
      // (r,mu_horizon).
      const distance = radiusCosAlpha
        .negate()
        .add(safeSqrt(discriminant.add(H.pow2())))
      const minDistance = atmosphere.topRadius.sub(radius).toVar()
      const maxDistance = distanceToHorizon.add(H)
      cosAlphaCoord.assign(
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
    const distanceToTop = distanceToTopAtmosphereBoundary(
      atmosphere,
      atmosphere.bottomRadius,
      cosPhi
    )
    const a = remap(distanceToTop, minDistance, maxDistance).toVar()
    const distance = distanceToTopAtmosphereBoundary(
      atmosphere,
      atmosphere.bottomRadius,
      atmosphere.minCosPhi
    )
    const A = remap(distance, minDistance, maxDistance)

    // An ad-hoc function equal to 0 for mu_s = mu_s_min (because then d = D and
    // thus a = A), equal to 1 for mu_s = 1 (because then d = dMin and thus
    // a = 0), and with a large slope around mu_s = 0, to get more texture
    // samples near the horizon.
    const cosPhiCoord = getTextureCoordFromUnitRange(
      max(sub(1, a.div(A)), 0).div(add(1, a)),
      SCATTERING_TEXTURE_MU_S_SIZE
    )
    const cosThetaCoord = cosTheta.add(1).div(2)

    return vec4(cosThetaCoord, cosPhiCoord, cosAlphaCoord, radiusCoord)
  }
)

export const getIrradianceTextureUv = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, radius: Length, cosPhi: Float): Vec2 => {
    const radiusUnit = remap(
      radius,
      atmosphere.bottomRadius,
      atmosphere.topRadius
    )
    const cosPhiUnit = cosPhi.mul(0.5).add(0.5)
    return vec2(
      getTextureCoordFromUnitRange(cosPhiUnit, IRRADIANCE_TEXTURE_WIDTH),
      getTextureCoordFromUnitRange(radiusUnit, IRRADIANCE_TEXTURE_HEIGHT)
    )
  }
)

export const getIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    irradianceTexture: IrradianceTexture,
    radius: Length,
    cosPhi: Float
  ): IrradianceSpectrum => {
    const uv = getIrradianceTextureUv(atmosphere, radius, cosPhi)
    return irradianceTexture.sample(uv).rgb
  }
)
