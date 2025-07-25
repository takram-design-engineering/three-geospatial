import {
  add,
  bool,
  clamp,
  cos,
  dot,
  equal,
  exp,
  float,
  floor,
  If,
  Loop,
  max,
  min,
  mod,
  mul,
  normalize,
  PI,
  remap,
  select,
  sin,
  sqrt,
  struct,
  sub,
  vec2,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import type { Node, StructNode } from 'three/webgpu'

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
import {
  clampCosine,
  clampRadius,
  distanceToBottomAtmosphereBoundary,
  distanceToTopAtmosphereBoundary,
  getIrradiance,
  getScatteringTextureCoord,
  getTransmittance,
  getTransmittanceToSun,
  getTransmittanceToTopAtmosphereBoundary,
  miePhaseFunction,
  rayIntersectsGround,
  rayleighPhaseFunction
} from './common'
import type {
  AbstractScatteringTexture,
  AbstractSpectrum,
  AtmosphereParams,
  Bool,
  DensityProfile,
  DensityProfileLayer,
  DimensionlessSpectrum,
  Float,
  Int,
  IrradianceSpectrum,
  IrradianceTexture,
  Length,
  RadianceDensitySpectrum,
  RadianceSpectrum,
  ReducedScatteringTexture,
  ScatteringDensityTexture,
  ScatteringTexture,
  TransmittanceTexture,
  Vec2,
  Vec3,
  Vec4
} from './definitions'

declare module 'three/src/nodes/TSL.js' {
  interface NodeElements {
    get: (node: Node, name: string) => ShaderNodeObject<Node>
  }
}

const TransmittanceParamsStruct = struct({
  radius: 'float',
  cosAlpha: 'float'
})

const ScatteringParamsStruct = struct({
  radius: 'float',
  cosAlpha: 'float',
  cosPhi: 'float',
  cosTheta: 'float',
  rayIntersectsGround: 'bool'
})

const IrradianceParamsStruct = struct({
  radius: 'float',
  cosPhi: 'float'
})

const SingleScatteringStruct = struct({
  rayleigh: 'vec3',
  mie: 'vec3'
})

const MultipleScatteringStruct = struct({
  radiance: 'vec3',
  cosTheta: 'float'
})

export const getLayerDensity = /*#__PURE__*/ Fnv(
  (layer: DensityProfileLayer, altitude: Length): Float => {
    return layer.expTerm
      .mul(exp(layer.expScale.mul(altitude)))
      .add(layer.linearTerm.mul(altitude))
      .add(layer.constantTerm)
      .saturate()
  }
)

export const getProfileDensity = /*#__PURE__*/ Fnv(
  (altitude: Length, profile: DensityProfile): Float => {
    return select(
      altitude.lessThan(profile.layers[0].width),
      getLayerDensity(profile.layers[0], altitude),
      getLayerDensity(profile.layers[1], altitude)
    )
  }
)

export const computeOpticalDepthToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    profile: DensityProfile,
    radius: Length,
    cosAlpha: Float
  ): Length => {
    const SAMPLE_COUNT = 500

    // The integration step, i.e. the length of each integration interval.
    const stepSize = distanceToTopAtmosphereBoundary(
      atmosphere,
      radius,
      cosAlpha
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const result = float(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = mul(float(i), stepSize).toVar()

      // Distance between the current sample point and the planet center.
      const r = sqrt(
        add(
          rayLength.pow2(),
          mul(2, radius, cosAlpha, rayLength),
          radius.pow2()
        )
      ).toVar()

      // Number density at the current sample point (divided by the number density
      // at the bottom of the atmosphere, yielding a dimensionless number).
      const y = getProfileDensity(r.sub(atmosphere.bottomRadius), profile)

      // Sample weight from the trapezoidal rule.
      const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
      result.addAssign(y.mul(weight).mul(stepSize))
    })

    return result
  }
)

export const computeTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    radius: Length,
    cosAlpha: Float,
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    precisionLog: boolean = false
  ): DimensionlessSpectrum => {
    const opticalDepth = add(
      atmosphere.rayleighScattering.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          atmosphere,
          atmosphere.rayleighDensity,
          radius,
          cosAlpha
        )
      ),
      atmosphere.mieExtinction.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          atmosphere,
          atmosphere.mieDensity,
          radius,
          cosAlpha
        )
      ),
      atmosphere.absorptionExtinction.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          atmosphere,
          atmosphere.absorptionDensity,
          radius,
          cosAlpha
        )
      )
    )
    if (precisionLog) {
      return opticalDepth
    } else {
      return exp(opticalDepth.negate())
    }
  }
)

export const getUnitRangeFromTextureCoord = /*#__PURE__*/ Fnv(
  (coord: Float, textureSize: Float): Float => {
    return coord
      .sub(textureSize.reciprocal().mul(0.5))
      .div(textureSize.reciprocal().oneMinus())
  }
)

export const getParamsFromTransmittanceTextureUv = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, uv: Vec2): StructNode => {
    const cosAlphaUnit = getUnitRangeFromTextureCoord(
      uv.x,
      TRANSMITTANCE_TEXTURE_WIDTH
    )
    const radiusUnit = getUnitRangeFromTextureCoord(
      uv.y,
      TRANSMITTANCE_TEXTURE_HEIGHT
    )

    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      atmosphere.topRadius.pow2().sub(atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon, from which we can compute r:
    const distanceToHorizon = H.mul(radiusUnit).toVar()
    const radius = sqrt(
      distanceToHorizon.pow2().add(atmosphere.bottomRadius.pow2())
    )

    // Distance to the top atmosphere boundary for the ray (r,mu), and its
    // minimum and maximum values over all mu - obtained for (r,1) and
    // (r,mu_horizon) - from which we can recover mu:
    const minDistance = atmosphere.topRadius.sub(radius).toVar()
    const maxDistance = distanceToHorizon.add(H)
    const distance = minDistance
      .add(cosAlphaUnit.mul(maxDistance.sub(minDistance)))
      .toVar()
    const cosAlpha = select(
      distance.equal(0),
      1,
      H.pow2()
        .sub(distanceToHorizon.pow2())
        .sub(distance.pow2())
        .div(radius.mul(2).mul(distance))
    )
    return TransmittanceParamsStruct(radius, cosAlpha)
  }
)

const TRANSMITTANCE_TEXTURE_SIZE = vec2(
  TRANSMITTANCE_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT
).toConst()

export const computeTransmittanceToTopAtmosphereBoundaryTexture =
  /*#__PURE__*/ Fnv(
    (atmosphere: AtmosphereParams, fragCoord: Vec2): DimensionlessSpectrum => {
      const params = getParamsFromTransmittanceTextureUv(
        atmosphere,
        fragCoord.div(TRANSMITTANCE_TEXTURE_SIZE)
      )
      return computeTransmittanceToTopAtmosphereBoundary(
        atmosphere,
        params.get('radius'),
        params.get('cosAlpha')
      )
    }
  )

export const computeSingleScatteringIntegrand = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    rayLength: Length,
    rayIntersectsGround: Bool
  ): StructNode => {
    const radiusEnd = clampRadius(
      atmosphere,
      sqrt(
        rayLength
          .pow2()
          .add(radius.mul(2).mul(cosAlpha).mul(rayLength))
          .add(radius.pow2())
      )
    ).toVar()
    const cosPhiEnd = clampCosine(
      radius.mul(cosPhi).add(rayLength.mul(cosTheta)).div(radiusEnd)
    )
    const transmittance = getTransmittance(
      atmosphere,
      transmittanceTexture,
      radius,
      cosAlpha,
      rayLength,
      rayIntersectsGround
    )
      .mul(
        getTransmittanceToSun(
          atmosphere,
          transmittanceTexture,
          radiusEnd,
          cosPhiEnd
        )
      )
      .toVar()

    const rayleigh = transmittance.mul(
      getProfileDensity(
        radiusEnd.sub(atmosphere.bottomRadius),
        atmosphere.rayleighDensity
      )
    )
    const mie = transmittance.mul(
      getProfileDensity(
        radiusEnd.sub(atmosphere.bottomRadius),
        atmosphere.mieDensity
      )
    )
    return SingleScatteringStruct(rayleigh, mie)
  }
)

export const distanceToNearestAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    radius: Length,
    cosAlpha: Float,
    rayIntersectsGround: Bool
  ): Length => {
    const result = float().toVar()
    If(rayIntersectsGround, () => {
      result.assign(
        distanceToBottomAtmosphereBoundary(atmosphere, radius, cosAlpha)
      )
    }).Else(() => {
      result.assign(
        distanceToTopAtmosphereBoundary(atmosphere, radius, cosAlpha)
      )
    })
    return result
  }
)

export const computeSingleScattering = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    rayIntersectsGround: Bool
  ) => {
    const SAMPLE_COUNT = 50

    // The integration step, i.e. the length of each integration interval.
    const stepSize = distanceToNearestAtmosphereBoundary(
      atmosphere,
      radius,
      cosAlpha,
      rayIntersectsGround
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const rayleighSum = vec3(0).toVar()
    const mieSum = vec3(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = mul(float(i), stepSize)

      // The Rayleigh and Mie single scattering at the current sample point.
      const deltaRayleighMie = computeSingleScatteringIntegrand(
        atmosphere,
        transmittanceTexture,
        radius,
        cosAlpha,
        cosPhi,
        cosTheta,
        rayLength,
        rayIntersectsGround
      )
      const deltaRayleigh = deltaRayleighMie.get('rayleigh')
      const deltaMie = deltaRayleighMie.get('mie')

      // Sample weight from the trapezoidal rule.
      const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
      rayleighSum.addAssign(deltaRayleigh.mul(weight))
      mieSum.addAssign(deltaMie.mul(weight))
    })

    const rayleigh = rayleighSum
      .mul(stepSize)
      .mul(atmosphere.solarIrradiance)
      .mul(atmosphere.rayleighScattering)
    const mie = mieSum
      .mul(stepSize)
      .mul(atmosphere.solarIrradiance)
      .mul(atmosphere.mieScattering)
    return SingleScatteringStruct(rayleigh, mie)
  }
)

export const getParamsFromScatteringTextureCoord = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, coord: Vec4) => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      sub(atmosphere.topRadius.pow2(), atmosphere.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon.
    const distanceToHorizon = H.mul(
      getUnitRangeFromTextureCoord(coord.w, SCATTERING_TEXTURE_R_SIZE)
    ).toVar()
    const radius = sqrt(
      add(distanceToHorizon.pow2(), atmosphere.bottomRadius.pow2())
    )

    const cosAlpha = float().toVar()
    const rayIntersectsGround = bool().toVar()
    If(coord.z.lessThan(0.5), () => {
      // Distance to the ground for the ray (r,mu), and its minimum and maximum
      // values over all mu - obtained for (r,-1) and (r,mu_horizon) - from which
      // we can recover mu:
      const minDistance = radius.sub(atmosphere.bottomRadius).toVar()
      const maxDistance = distanceToHorizon
      const distance = minDistance
        .add(
          maxDistance
            .sub(minDistance)
            .mul(
              getUnitRangeFromTextureCoord(
                coord.z.mul(2).oneMinus(),
                SCATTERING_TEXTURE_MU_SIZE / 2
              )
            )
        )
        .toVar()
      cosAlpha.assign(
        select(
          distance.equal(0),
          float(-1),
          clampCosine(
            distanceToHorizon
              .pow2()
              .add(distance.pow2())
              .negate()
              .div(radius.mul(2).mul(distance))
          )
        )
      )
      rayIntersectsGround.assign(bool(true))
    }).Else(() => {
      // Distance to the top atmosphere boundary for the ray (r,mu), and its
      // minimum and maximum values over all mu - obtained for (r,1) and
      // (r,mu_horizon) - from which we can recover mu:
      const minDistance = atmosphere.topRadius.sub(radius).toVar()
      const maxDistance = distanceToHorizon.add(H)
      const distance = minDistance
        .add(
          maxDistance
            .sub(minDistance)
            .mul(
              getUnitRangeFromTextureCoord(
                coord.z.mul(2).sub(1),
                SCATTERING_TEXTURE_MU_SIZE / 2
              )
            )
        )
        .toVar()
      cosAlpha.assign(
        select(
          distance.equal(0),
          1,
          clampCosine(
            H.pow2()
              .sub(distanceToHorizon.pow2())
              .sub(distance.pow2())
              .div(radius.mul(2).mul(distance))
          )
        )
      )
      rayIntersectsGround.assign(bool(false))
    })

    const cosPhiUnit = getUnitRangeFromTextureCoord(
      coord.y,
      SCATTERING_TEXTURE_MU_S_SIZE
    ).toVar()
    const minDistance = atmosphere.topRadius
      .sub(atmosphere.bottomRadius)
      .toVar()
    const maxDistance = H
    const D = distanceToTopAtmosphereBoundary(
      atmosphere,
      atmosphere.bottomRadius,
      atmosphere.minCosPhi
    )
    const A = remap(D, minDistance, maxDistance).toVar()
    const a = A.sub(cosPhiUnit.mul(A)).div(cosPhiUnit.mul(A).add(1))
    const distance = minDistance
      .add(min(a, A).mul(maxDistance.sub(minDistance)))
      .toVar()
    const cosPhi = select(
      distance.equal(0),
      1,
      clampCosine(
        H.pow2()
          .sub(distance.pow2())
          .div(atmosphere.bottomRadius.mul(2).mul(distance))
      )
    )
    const cosTheta = clampCosine(coord.x.mul(2).sub(1))

    return ScatteringParamsStruct(
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
      rayIntersectsGround
    )
  }
)

const SCATTERING_TEXTURE_SIZE = vec4(
  SCATTERING_TEXTURE_NU_SIZE - 1,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_R_SIZE
).toConst()

export const getParamsFromScatteringTextureFragCoord = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, fragCoord: Vec2) => {
    const fragCoordCosTheta = floor(
      fragCoord.x.div(SCATTERING_TEXTURE_MU_S_SIZE)
    )
    const fragCoordCosPhi = mod(fragCoord.x, SCATTERING_TEXTURE_MU_S_SIZE)
    const coord = vec4(
      fragCoordCosTheta,
      fragCoordCosPhi,
      fragCoord.y,
      fragCoord.z
    ).div(SCATTERING_TEXTURE_SIZE)
    const params = getParamsFromScatteringTextureCoord(atmosphere, coord)
    const radius = params.get('radius')
    const cosAlpha = params.get('cosAlpha')
    const cosPhi = params.get('cosPhi')
    const cosTheta = params.get('cosTheta')
    const rayIntersectsGround = params.get('rayIntersectsGround')

    // Clamp nu to its valid range of values, given mu and mu_s.
    cosTheta.assign(
      clamp(
        cosTheta,
        cosAlpha
          .mul(cosPhi)
          .sub(sqrt(cosAlpha.pow2().oneMinus().mul(cosPhi.pow2().oneMinus()))),
        cosAlpha
          .mul(cosPhi)
          .add(sqrt(cosAlpha.pow2().oneMinus().mul(cosPhi.pow2().oneMinus())))
      )
    )
    return ScatteringParamsStruct(
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
      rayIntersectsGround
    )
  }
)

export const computeSingleScatteringTexture = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    fragCoord: Vec3
  ) => {
    const params = getParamsFromScatteringTextureFragCoord(
      atmosphere,
      fragCoord
    )
    const radius = params.get('radius')
    const cosAlpha = params.get('cosAlpha')
    const cosPhi = params.get('cosPhi')
    const cosTheta = params.get('cosTheta')
    const rayIntersectsGround = params.get('rayIntersectsGround')
    return computeSingleScattering(
      atmosphere,
      transmittanceTexture,
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
      rayIntersectsGround
    )
  }
)

export const getScattering0 = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    scatteringTexture: AbstractScatteringTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    rayIntersectsGround: Bool
  ): AbstractSpectrum => {
    const coord = getScatteringTextureCoord(
      atmosphere,
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
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
    return vec3(
      scatteringTexture
        .sample(coord0)
        .mul(lerp.oneMinus())
        .add(scatteringTexture.sample(coord1).mul(lerp))
    )
  }
)

export const getScattering1 = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    rayIntersectsGround: Bool,
    scatteringOrder: Int
  ): RadianceSpectrum => {
    const result = vec3().toVar()
    If(scatteringOrder.equal(1), () => {
      const rayleigh = getScattering0(
        atmosphere,
        singleRayleighScatteringTexture,
        radius,
        cosAlpha,
        cosPhi,
        cosTheta,
        rayIntersectsGround
      )
      const mie = getScattering0(
        atmosphere,
        singleMieScatteringTexture,
        radius,
        cosAlpha,
        cosPhi,
        cosTheta,
        rayIntersectsGround
      )
      result.assign(
        add(
          rayleigh.mul(rayleighPhaseFunction(cosTheta)),
          mie.mul(miePhaseFunction(atmosphere.miePhaseFunctionG, cosTheta))
        )
      )
    }).Else(() => {
      result.assign(
        getScattering0(
          atmosphere,
          multipleScatteringTexture,
          radius,
          cosAlpha,
          cosPhi,
          cosTheta,
          rayIntersectsGround
        )
      )
    })
    return result
  }
)

export const computeScatteringDensity = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    irradianceTexture: IrradianceTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    scatteringOrder: Int
  ): RadianceDensitySpectrum => {
    // Compute unit direction vectors for the zenith, the view direction omega
    // and and the sun direction omega_s, such that the cosine of the
    // view-zenith angle is mu, the cosine of the sun-zenith angle is mu_s, and
    // the cosine of the view-sun angle is nu. The goal is to simplify
    // computations below.
    const zenithDirection = vec3(0, 0, 1).toConst()
    const omega = vec3(sqrt(cosAlpha.pow2().oneMinus()), 0, cosAlpha).toVar()
    const sunDirectionX = select(
      omega.x.equal(0),
      0,
      cosTheta.sub(cosAlpha.mul(cosPhi)).div(omega.x)
    ).toVar()
    const sunDirectionY = sqrt(
      max(sunDirectionX.pow2().add(cosPhi.pow2()).oneMinus(), 0)
    )
    const omegaS = vec3(sunDirectionX, sunDirectionY, cosPhi)
    const SAMPLE_COUNT = 16
    const dPhi = PI.div(SAMPLE_COUNT)
    const dTheta = PI.div(SAMPLE_COUNT)
    const radiance = vec3(0).toVar()

    // Nested loops for the integral over all the incident directions omega_i.
    Loop({ start: 0, end: SAMPLE_COUNT }, ({ i: l }) => {
      const theta = float(l).add(0.5).mul(dTheta)
      const cosTheta = cos(theta).toVar()
      const sinTheta = sin(theta).toVar()
      const rayRadiusThetaIntersectsGround = rayIntersectsGround(
        atmosphere,
        radius,
        cosTheta
      ).toVar()

      // The distance and transmittance to the ground only depend on theta, so
      // we can compute them in the outer loop for efficiency.
      const distanceToGround = float(0).toVar()
      const transmittanceToGround = vec3(0).toVar()
      const groundAlbedo = vec3(0).toVar()

      If(rayRadiusThetaIntersectsGround, () => {
        distanceToGround.assign(
          distanceToBottomAtmosphereBoundary(atmosphere, radius, cosTheta)
        )
        transmittanceToGround.assign(
          getTransmittance(
            atmosphere,
            transmittanceTexture,
            radius,
            cosTheta,
            distanceToGround,
            bool(true)
          )
        )
        groundAlbedo.assign(atmosphere.groundAlbedo)
      })

      Loop({ start: 0, end: mul(SAMPLE_COUNT, 2) }, ({ i: m }) => {
        const phi = float(m).add(0.5).mul(dPhi).toVar()
        const omegaI = vec3(
          cos(phi).mul(sinTheta),
          sin(phi).mul(sinTheta),
          cosTheta
        ).toVar()
        const dOmegaI = dTheta.mul(dPhi).mul(sin(theta)).toVar()

        // The radiance L_i arriving from direction omega_i after n-1 bounces is
        // the sum of a term given by the precomputed scattering texture for the
        // (n-1)-th order:
        const cosTheta1 = dot(omegaS, omegaI)
        const incidentRadiance = getScattering1(
          atmosphere,
          singleRayleighScatteringTexture,
          singleMieScatteringTexture,
          multipleScatteringTexture,
          radius,
          omegaI.z,
          cosPhi,
          cosTheta1,
          rayRadiusThetaIntersectsGround,
          scatteringOrder.sub(1)
        ).toVar()

        // and of the contribution from the light paths with n-1 bounces and
        // whose last bounce is on the ground. This contribution is the product
        // of the transmittance to the ground, the ground albedo, the ground
        // BRDF, and the irradiance received on the ground after n-2 bounces.
        const groundNormal = normalize(
          zenithDirection.mul(radius).add(omegaI.mul(distanceToGround))
        )
        const groundIrradiance = getIrradiance(
          atmosphere,
          irradianceTexture,
          atmosphere.bottomRadius,
          dot(groundNormal, omegaS)
        )
        incidentRadiance.addAssign(
          transmittanceToGround.mul(groundAlbedo).div(PI).mul(groundIrradiance)
        )

        // The radiance finally scattered from direction omega_i towards
        // direction -omega is the product of the incident radiance, the
        // scattering coefficient, and the phase function for directions omega
        // and omega_i (all this summed over all particle types, i.e. Rayleigh
        // and Mie).
        const cosTheta2 = dot(omega, omegaI).toVar()
        const rayleighDensity = getProfileDensity(
          radius.sub(atmosphere.bottomRadius),
          atmosphere.rayleighDensity
        )
        const mieDensity = getProfileDensity(
          radius.sub(atmosphere.bottomRadius),
          atmosphere.mieDensity
        )
        radiance.addAssign(
          incidentRadiance
            .mul(
              add(
                atmosphere.rayleighScattering
                  .mul(rayleighDensity)
                  .mul(rayleighPhaseFunction(cosTheta2)),
                atmosphere.mieScattering
                  .mul(mieDensity)
                  .mul(
                    miePhaseFunction(atmosphere.miePhaseFunctionG, cosTheta2)
                  )
              )
            )
            .mul(dOmegaI)
        )
      })
    })

    return radiance
  }
)

export const computeMultipleScattering = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringDensityTexture: ScatteringDensityTexture,
    radius: Length,
    cosAlpha: Float,
    cosPhi: Float,
    cosTheta: Float,
    rayIntersectsGround: Bool
  ): RadianceSpectrum => {
    const SAMPLE_COUNT = 50

    // The integration step, i.e. the length of each integration interval.
    const stepSize = distanceToNearestAtmosphereBoundary(
      atmosphere,
      radius,
      cosAlpha,
      rayIntersectsGround
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const radianceSum = vec3(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = float(i).mul(stepSize)

      // The r, mu and mu_s parameters at the current integration point (see the
      // single scattering section for a detailed explanation).
      const radiusI = clampRadius(
        atmosphere,
        sqrt(
          rayLength
            .mul(rayLength)
            .add(radius.mul(2).mul(cosAlpha).mul(rayLength))
            .add(radius.mul(radius))
        )
      )
      const cosAlphaI = clampCosine(
        radius.mul(cosAlpha).add(rayLength).div(radiusI)
      )
      const cosPhiI = clampCosine(
        radius.mul(cosPhi).add(rayLength.mul(cosTheta)).div(radiusI)
      )

      // The Rayleigh and Mie multiple scattering at the current sample point.
      const radiance = getScattering0(
        atmosphere,
        scatteringDensityTexture,
        radiusI,
        cosAlphaI,
        cosPhiI,
        cosTheta,
        rayIntersectsGround
      )
        .mul(
          getTransmittance(
            atmosphere,
            transmittanceTexture,
            radius,
            cosAlpha,
            rayLength,
            rayIntersectsGround
          )
        )
        .mul(stepSize)

      // Sample weight from the trapezoidal rule.
      const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
      radianceSum.addAssign(radiance.mul(weight))
    })

    return radianceSum
  }
)

export const computeScatteringDensityTexture = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    irradianceTexture: IrradianceTexture,
    fragCoord: Vec2,
    scatteringOrder: Int
  ): RadianceDensitySpectrum => {
    const params = getParamsFromScatteringTextureFragCoord(
      atmosphere,
      fragCoord
    )
    const radius = params.get('radius')
    const cosAlpha = params.get('cosAlpha')
    const cosPhi = params.get('cosPhi')
    const cosTheta = params.get('cosTheta')
    return computeScatteringDensity(
      atmosphere,
      transmittanceTexture,
      singleRayleighScatteringTexture,
      singleMieScatteringTexture,
      multipleScatteringTexture,
      irradianceTexture,
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
      scatteringOrder
    )
  }
)

export const computeMultipleScatteringTexture = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringDensityTexture: ScatteringDensityTexture,
    fragCoord: Vec2
  ): RadianceSpectrum => {
    const params = getParamsFromScatteringTextureFragCoord(
      atmosphere,
      fragCoord
    )
    const radius = params.get('radius')
    const cosAlpha = params.get('cosAlpha')
    const cosPhi = params.get('cosPhi')
    const cosTheta = params.get('cosTheta')
    const rayIntersectsGround = params.get('rayIntersectsGround')
    const radiance = computeMultipleScattering(
      atmosphere,
      transmittanceTexture,
      scatteringDensityTexture,
      radius,
      cosAlpha,
      cosPhi,
      cosTheta,
      rayIntersectsGround
    )
    return MultipleScatteringStruct(radiance, cosTheta)
  }
)

export const computeDirectIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    radius: Length,
    cosPhi: Float
  ): IrradianceSpectrum => {
    const alpha = atmosphere.sunAngularRadius

    // Approximate average of the cosine factor mu_s over the visible fraction
    // of the Sun disc.
    const averageCosineFactor = select(
      cosPhi.lessThan(alpha.negate()),
      0,
      select(
        cosPhi.greaterThan(alpha),
        cosPhi,
        cosPhi.add(alpha).pow2().div(alpha.mul(4))
      )
    )

    return atmosphere.solarIrradiance
      .mul(
        getTransmittanceToTopAtmosphereBoundary(
          atmosphere,
          transmittanceTexture,
          radius,
          cosPhi
        )
      )
      .mul(averageCosineFactor)
  }
)

export const computeIndirectIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    radius: Length,
    cosPhi: Float,
    scatteringOrder: Int
  ): IrradianceSpectrum => {
    const SAMPLE_COUNT = 32
    const deltaPhi = PI.div(SAMPLE_COUNT).toVar()
    const deltaTheta = PI.div(SAMPLE_COUNT).toVar()

    const result = vec3(0).toVar()
    const omegaS = vec3(sqrt(cosPhi.pow2().oneMinus()), 0, cosPhi).toVar()

    Loop({ start: 0, end: SAMPLE_COUNT / 2 }, ({ i: j }) => {
      const theta = float(j).add(0.5).mul(deltaTheta).toVar()

      Loop({ start: 0, end: SAMPLE_COUNT * 2 }, ({ i }) => {
        const phi = float(i).add(0.5).mul(deltaPhi).toVar()
        const omega = vec3(
          cos(phi).mul(sin(theta)),
          sin(phi).mul(sin(theta)),
          cos(theta)
        ).toVar()
        const deltaOmega = deltaTheta.mul(deltaPhi).mul(sin(theta))
        const cosTheta = dot(omega, omegaS)
        result.addAssign(
          getScattering1(
            atmosphere,
            singleRayleighScatteringTexture,
            singleMieScatteringTexture,
            multipleScatteringTexture,
            radius,
            omega.z,
            cosPhi,
            cosTheta,
            bool(false),
            scatteringOrder
          )
            .mul(omega.z)
            .mul(deltaOmega)
        )
      })
    })

    return result
  }
)

export const getParamsFromIrradianceTextureUv = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, uv: Vec2) => {
    const cosPhiUnit = getUnitRangeFromTextureCoord(
      uv.x,
      IRRADIANCE_TEXTURE_WIDTH
    )
    const radiusUnit = getUnitRangeFromTextureCoord(
      uv.y,
      IRRADIANCE_TEXTURE_HEIGHT
    )
    const radius = atmosphere.bottomRadius.add(
      radiusUnit.mul(atmosphere.topRadius.sub(atmosphere.bottomRadius))
    )
    const cosPhi = clampCosine(cosPhiUnit.mul(2).sub(1))
    return IrradianceParamsStruct(radius, cosPhi)
  }
)

const IRRADIANCE_TEXTURE_SIZE = vec2(
  IRRADIANCE_TEXTURE_WIDTH,
  IRRADIANCE_TEXTURE_HEIGHT
).toConst()

export const computeDirectIrradianceTexture = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    fragCoord: Vec2
  ): IrradianceSpectrum => {
    const params = getParamsFromIrradianceTextureUv(
      atmosphere,
      fragCoord.div(IRRADIANCE_TEXTURE_SIZE)
    )
    const radius = params.get('radius')
    const cosPhi = params.get('cosPhi')
    return computeDirectIrradiance(
      atmosphere,
      transmittanceTexture,
      radius,
      cosPhi
    )
  }
)

export const computeIndirectIrradianceTexture = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    fragCoord: Vec2,
    scatteringOrder: Int
  ): IrradianceSpectrum => {
    const params = getParamsFromIrradianceTextureUv(
      atmosphere,
      fragCoord.div(IRRADIANCE_TEXTURE_SIZE)
    )
    const radius = params.get('radius')
    const cosPhi = params.get('cosPhi')
    return computeIndirectIrradiance(
      atmosphere,
      singleRayleighScatteringTexture,
      singleMieScatteringTexture,
      multipleScatteringTexture,
      radius,
      cosPhi,
      scatteringOrder
    )
  }
)
