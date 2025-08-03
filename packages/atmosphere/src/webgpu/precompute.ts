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
  bool,
  clamp,
  cos,
  equal,
  exp,
  float,
  floor,
  If,
  Loop,
  max,
  min,
  mul,
  normalize,
  PI,
  select,
  sin,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import {
  Fnv,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type {
  AtmosphereParametersNodes,
  DensityProfileNodes,
  DensityProfileLayerNodes
} from './AtmosphereParameters'
import {
  clampCosine,
  clampRadius,
  distanceToBottomAtmosphereBoundary,
  distanceToTopAtmosphereBoundary,
  getIrradiance,
  getScattering,
  getTransmittance,
  getTransmittanceToSun,
  getTransmittanceToTopAtmosphereBoundary,
  miePhaseFunction,
  rayIntersectsGround,
  rayleighPhaseFunction
} from './common'
import {
  Dimensionless,
  DimensionlessSpectrum,
  Length,
  RadianceSpectrum,
  type IrradianceSpectrum,
  type IrradianceTextureNode,
  type RadianceDensitySpectrum,
  type ReducedScatteringTextureNode,
  type ScatteringDensityTextureNode,
  type ScatteringTextureNode,
  type TransmittanceTextureNode
} from './dimensional'

declare module 'three/src/nodes/TSL.js' {
  interface NodeElements {
    get: (node: Node, name: string) => NodeObject
  }
}

const getLayerDensity = /*#__PURE__*/ Fnv(
  (
    layer: DensityProfileLayerNodes,
    altitude: NodeObject<Length>
  ): Node<Dimensionless> => {
    return layer.expTerm
      .mul(exp(layer.expScale.mul(altitude)))
      .add(layer.linearTerm.mul(altitude))
      .add(layer.constantTerm)
      .saturate()
  }
)

const getProfileDensity = /*#__PURE__*/ Fnv(
  (
    profile: DensityProfileNodes,
    altitude: NodeObject<Length>
  ): Node<Dimensionless> => {
    return select(
      altitude.lessThan(profile.layers[0].width),
      getLayerDensity(profile.layers[0], altitude),
      getLayerDensity(profile.layers[1], altitude)
    )
  }
)

const computeOpticalDepthToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    profile: DensityProfileNodes,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<Length> => {
    const SAMPLE_COUNT = 500
    const stepSize = distanceToTopAtmosphereBoundary(
      parameters,
      radius,
      cosView
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const opticalDepth = float(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = float(i).mul(stepSize).toVar()

      // Distance between the current sample point and the planet center.
      const r = sqrt(
        add(rayLength.pow2(), mul(2, radius, cosView, rayLength), radius.pow2())
      ).toVar()

      // Number density at the current sample point (divided by the number
      // density at the bottom of the atmosphere, yielding a dimensionless
      // number).
      const y = getProfileDensity(profile, r.sub(parameters.bottomRadius))

      // Sample weight from the trapezoidal rule.
      const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
      opticalDepth.addAssign(y.mul(weight).mul(stepSize))
    })

    return opticalDepth
  }
)

const computeTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<DimensionlessSpectrum> => {
    const opticalDepth = add(
      parameters.rayleighScattering.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          parameters,
          parameters.rayleighDensity,
          radius,
          cosView
        )
      ),
      parameters.mieExtinction.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          parameters,
          parameters.mieDensity,
          radius,
          cosView
        )
      ),
      parameters.absorptionExtinction.mul(
        computeOpticalDepthToTopAtmosphereBoundary(
          parameters,
          parameters.absorptionDensity,
          radius,
          cosView
        )
      )
    ).toVar()
    if (parameters.transmittancePrecisionLog) {
      return opticalDepth
    } else {
      return exp(opticalDepth.negate())
    }
  }
)

const getUnitRangeFromTextureCoord = /*#__PURE__*/ Fnv(
  (
    coord: NodeObject<'float'>,
    textureSize: NodeObject<'int'>
  ): Node<'float'> => {
    return coord
      .sub(textureSize.reciprocal().mul(0.5))
      .div(textureSize.reciprocal().oneMinus())
  }
)

const transmittanceParamsStruct = /*#__PURE__*/ struct({
  radius: Length,
  cosView: Dimensionless
})
type TransmittanceParamsStruct = ReturnType<typeof transmittanceParamsStruct>

const getParamsFromTransmittanceTextureUV = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    uv: NodeObject<'vec2'>
  ): TransmittanceParamsStruct => {
    const cosViewUnit = getUnitRangeFromTextureCoord(
      uv.x,
      parameters.transmittanceTextureSize.x
    )
    const radiusUnit = getUnitRangeFromTextureCoord(
      uv.y,
      parameters.transmittanceTextureSize.y
    )

    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      parameters.topRadius.pow2().sub(parameters.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon, from which we can compute radius.
    const distanceToHorizon = H.mul(radiusUnit).toVar()
    const radius = sqrt(
      distanceToHorizon.pow2().add(parameters.bottomRadius.pow2())
    )

    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon) - from which we can recover cosView.
    const minDistance = parameters.topRadius.sub(radius).toVar()
    const maxDistance = distanceToHorizon.add(H)
    const distance = minDistance
      .add(cosViewUnit.mul(maxDistance.sub(minDistance)))
      .toVar()
    const cosView = select(
      distance.equal(0),
      1,
      H.pow2()
        .sub(distanceToHorizon.pow2())
        .sub(distance.pow2())
        .div(radius.mul(2).mul(distance))
    )
    return transmittanceParamsStruct(radius, cosView)
  }
)

export const computeTransmittanceToTopAtmosphereBoundaryTexture =
  /*#__PURE__*/ Fnv(
    (
      parameters: AtmosphereParametersNodes,
      fragCoord: NodeObject<'vec2'>
    ): Node<DimensionlessSpectrum> => {
      const transmittanceParams = getParamsFromTransmittanceTextureUV(
        parameters,
        fragCoord.div(vec2(parameters.transmittanceTextureSize))
      ).toVar()
      return computeTransmittanceToTopAtmosphereBoundary(
        parameters,
        transmittanceParams.get('radius'),
        transmittanceParams.get('cosView')
      )
    }
  )

const singleScatteringStruct = /*#__PURE__*/ struct({
  rayleigh: DimensionlessSpectrum,
  mie: DimensionlessSpectrum
})
type SingleScatteringStruct = ReturnType<typeof singleScatteringStruct>

const computeSingleScatteringIntegrand = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayLength: NodeObject<Length>,
    rayIntersectsGround: NodeObject<'bool'>
  ): SingleScatteringStruct => {
    const radiusEnd = clampRadius(
      parameters,
      sqrt(
        rayLength
          .pow2()
          .add(mul(2, radius, cosView, rayLength))
          .add(radius.pow2())
      )
    ).toVar()
    const cosSunEnd = clampCosine(
      radius.mul(cosSun).add(rayLength.mul(cosViewSun)).div(radiusEnd)
    )
    const transmittance = getTransmittance(
      parameters,
      transmittanceTexture,
      radius,
      cosView,
      rayLength,
      rayIntersectsGround
    )
      .mul(
        getTransmittanceToSun(
          parameters,
          transmittanceTexture,
          radiusEnd,
          cosSunEnd
        )
      )
      .toVar()

    const rayleigh = transmittance.mul(
      getProfileDensity(
        parameters.rayleighDensity,
        radiusEnd.sub(parameters.bottomRadius)
      )
    )
    const mie = transmittance.mul(
      getProfileDensity(
        parameters.mieDensity,
        radiusEnd.sub(parameters.bottomRadius)
      )
    )
    return singleScatteringStruct(rayleigh, mie)
  }
)

const distanceToNearestAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>
  ): Node<Length> => {
    const result = float().toVar()
    If(rayIntersectsGround, () => {
      result.assign(
        distanceToBottomAtmosphereBoundary(parameters, radius, cosView)
      )
    }).Else(() => {
      result.assign(
        distanceToTopAtmosphereBoundary(parameters, radius, cosView)
      )
    })
    return result
  }
)

const computeSingleScattering = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>
  ): SingleScatteringStruct => {
    const SAMPLE_COUNT = 50
    const stepSize = distanceToNearestAtmosphereBoundary(
      parameters,
      radius,
      cosView,
      rayIntersectsGround
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const rayleighSum = vec3(0).toVar()
    const mieSum = vec3(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = float(i).mul(stepSize)

      // The Rayleigh and Mie single scattering at the current sample point.
      const deltaRayleighMie = computeSingleScatteringIntegrand(
        parameters,
        transmittanceTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        rayLength,
        rayIntersectsGround
      ).toVar()
      const deltaRayleigh = deltaRayleighMie.get('rayleigh')
      const deltaMie = deltaRayleighMie.get('mie')

      // Sample weight from the trapezoidal rule.
      const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
      rayleighSum.addAssign(deltaRayleigh.mul(weight))
      mieSum.addAssign(deltaMie.mul(weight))
    })

    const rayleigh = mul(
      rayleighSum,
      stepSize,
      parameters.solarIrradiance,
      parameters.rayleighScattering
    )
    const mie = mul(
      mieSum,
      stepSize,
      parameters.solarIrradiance,
      parameters.mieScattering
    )
    return singleScatteringStruct(rayleigh, mie)
  }
)

const scatteringParamsStruct = /*#__PURE__*/ struct({
  radius: Length,
  cosView: Dimensionless,
  cosSun: Dimensionless,
  cosViewSun: Dimensionless,
  rayIntersectsGround: 'bool'
})
type ScatteringParamsStruct = ReturnType<typeof scatteringParamsStruct>

const getParamsFromScatteringTextureCoord = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    coord: NodeObject<'vec4'>
  ): ScatteringParamsStruct => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      parameters.topRadius.pow2().sub(parameters.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon.
    const distanceToHorizon = H.mul(
      getUnitRangeFromTextureCoord(
        coord.w,
        parameters.scatteringTextureRadiusSize
      )
    ).toVar()
    const radius = sqrt(
      distanceToHorizon.pow2().add(parameters.bottomRadius.pow2())
    )

    const cosView = float().toVar()
    const rayIntersectsGround = bool().toVar()
    If(coord.z.lessThan(0.5), () => {
      // Distance to the ground for the ray (radius, cosView), and its minimum
      // and maximum values over all cosView - obtained for (radius, -1) and
      // (radius, cosHorizon) - from which we can recover cosView.
      const minDistance = radius.sub(parameters.bottomRadius).toVar()
      const maxDistance = distanceToHorizon
      const distance = minDistance
        .add(
          maxDistance
            .sub(minDistance)
            .mul(
              getUnitRangeFromTextureCoord(
                coord.z.mul(2).oneMinus(),
                parameters.scatteringTextureCosViewSize / 2
              )
            )
        )
        .toVar()
      cosView.assign(
        select(
          distance.equal(0),
          -1,
          clampCosine(
            distanceToHorizon
              .pow2()
              .add(distance.pow2())
              .negate()
              .div(mul(2, radius, distance))
          )
        )
      )
      rayIntersectsGround.assign(bool(true))
    }).Else(() => {
      // Distance to the top atmosphere boundary for the ray (radius, cosView),
      // and its minimum and maximum values over all cosView - obtained for
      // (radius, 1) and (radius, cosHorizon) - from which we can recover
      // cosView.
      const minDistance = parameters.topRadius.sub(radius).toVar()
      const maxDistance = distanceToHorizon.add(H)
      const distance = minDistance
        .add(
          maxDistance
            .sub(minDistance)
            .mul(
              getUnitRangeFromTextureCoord(
                coord.z.mul(2).sub(1),
                parameters.scatteringTextureCosViewSize / 2
              )
            )
        )
        .toVar()
      cosView.assign(
        select(
          distance.equal(0),
          1,
          clampCosine(
            H.pow2()
              .sub(distanceToHorizon.pow2())
              .sub(distance.pow2())
              .div(mul(2, radius, distance))
          )
        )
      )
      rayIntersectsGround.assign(bool(false))
    })

    const cosSunUnit = getUnitRangeFromTextureCoord(
      coord.y,
      parameters.scatteringTextureCosSunSize
    ).toVar()
    const minDistance = parameters.topRadius
      .sub(parameters.bottomRadius)
      .toVar()
    const maxDistance = H
    const D = distanceToTopAtmosphereBoundary(
      parameters,
      parameters.bottomRadius,
      parameters.minCosSun
    )
    const A = D.remap(minDistance, maxDistance).toVar()
    const a = A.sub(cosSunUnit.mul(A)).div(cosSunUnit.mul(A).add(1))
    const distance = minDistance
      .add(min(a, A).mul(maxDistance.sub(minDistance)))
      .toVar()
    const cosSun = select(
      distance.equal(0),
      1,
      clampCosine(
        H.pow2()
          .sub(distance.pow2())
          .div(mul(2, parameters.bottomRadius, distance))
      )
    )
    const cosViewSun = clampCosine(coord.x.mul(2).sub(1))

    return scatteringParamsStruct(
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    )
  }
)

const getParamsFromScatteringTextureFragCoord = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    fragCoord: NodeObject<'vec3'>
  ): ScatteringParamsStruct => {
    const fragCoordCosViewSun = floor(
      fragCoord.x.div(parameters.scatteringTextureCosSunSize)
    )
    const fragCoordCosSun = fragCoord.x.mod(
      parameters.scatteringTextureCosSunSize
    )
    const size = vec4(
      parameters.scatteringTextureCosViewSunSize - 1,
      parameters.scatteringTextureCosSunSize,
      parameters.scatteringTextureCosViewSize,
      parameters.scatteringTextureRadiusSize
    ).toConst()
    const coord = vec4(
      fragCoordCosViewSun,
      fragCoordCosSun,
      fragCoord.y,
      fragCoord.z
    ).div(size)
    const scatteringParams = getParamsFromScatteringTextureCoord(
      parameters,
      coord
    ).toVar()
    const radius = scatteringParams.get('radius')
    const cosView = scatteringParams.get('cosView')
    const cosSun = scatteringParams.get('cosSun')
    const cosViewSun = scatteringParams.get('cosViewSun')
    const rayIntersectsGround = scatteringParams.get('rayIntersectsGround')

    // Clamp cosViewSun to its valid range of values, given cosView and cosSun.
    cosViewSun.assign(
      clamp(
        cosViewSun,
        cosView
          .mul(cosSun)
          .sub(sqrt(cosView.pow2().oneMinus().mul(cosSun.pow2().oneMinus()))),
        cosView
          .mul(cosSun)
          .add(sqrt(cosView.pow2().oneMinus().mul(cosSun.pow2().oneMinus())))
      )
    )
    return scatteringParamsStruct(
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    )
  }
)

export const computeSingleScatteringTexture = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    fragCoord: NodeObject<'vec3'>
  ) => {
    const scatteringParams = getParamsFromScatteringTextureFragCoord(
      parameters,
      fragCoord
    ).toVar()
    const radius = scatteringParams.get('radius')
    const cosView = scatteringParams.get('cosView')
    const cosSun = scatteringParams.get('cosSun')
    const cosViewSun = scatteringParams.get('cosViewSun')
    const rayIntersectsGround = scatteringParams.get('rayIntersectsGround')
    return computeSingleScattering(
      parameters,
      transmittanceTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    )
  }
)

const getScatteringForOrder = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    singleRayleighScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    multipleScatteringTexture: NodeObject<ScatteringTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>,
    scatteringOrder: NodeObject<'int'>
  ): Node<RadianceSpectrum> => {
    const result = vec3().toVar()
    If(scatteringOrder.equal(1), () => {
      const rayleigh = getScattering(
        parameters,
        singleRayleighScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        rayIntersectsGround
      )
      const mie = getScattering(
        parameters,
        singleMieScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        rayIntersectsGround
      )
      result.assign(
        add(
          rayleigh.mul(rayleighPhaseFunction(cosViewSun)),
          mie.mul(miePhaseFunction(parameters.miePhaseFunctionG, cosViewSun))
        )
      )
    }).Else(() => {
      result.assign(
        getScattering(
          parameters,
          multipleScatteringTexture,
          radius,
          cosView,
          cosSun,
          cosViewSun,
          rayIntersectsGround
        )
      )
    })
    return result
  }
)

const computeScatteringDensity = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    singleRayleighScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    multipleScatteringTexture: NodeObject<ScatteringTextureNode>,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    scatteringOrder: NodeObject<'int'>
  ): Node<RadianceDensitySpectrum> => {
    // Compute unit direction vectors for the zenith, the view direction omega
    // and the sun direction omegaSun, such that the cosine of the view-zenith
    // angle is cosView, the cosine of the sun-zenith angle is cosSun, and
    // the cosine of the view-sun angle is cosViewSun. The goal is to simplify
    // computations below.
    const zenithDirection = vec3(0, 0, 1).toConst()
    const omega = vec3(sqrt(cosView.pow2().oneMinus()), 0, cosView).toVar()
    const sunDirectionX = select(
      omega.x.equal(0),
      0,
      cosViewSun.sub(cosView.mul(cosSun)).div(omega.x)
    ).toVar()
    const sunDirectionY = sqrt(
      max(sunDirectionX.pow2().add(cosSun.pow2()).oneMinus(), 0)
    )
    const omegaSun = vec3(sunDirectionX, sunDirectionY, cosSun).toVar()
    const SAMPLE_COUNT = 16
    const deltaPhi = PI.div(SAMPLE_COUNT).toConst()
    const deltaTheta = PI.div(SAMPLE_COUNT).toConst()
    const radiance = vec3(0).toVar()

    // Nested loops for the integral over all the incident directions omegaI.
    Loop({ start: 0, end: SAMPLE_COUNT }, ({ i: l }) => {
      const theta = float(l).add(0.5).mul(deltaTheta)
      const cosTheta = cos(theta).toVar()
      const sinTheta = sin(theta).toVar()
      const rayRadiusThetaIntersectsGround = rayIntersectsGround(
        parameters,
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
          distanceToBottomAtmosphereBoundary(parameters, radius, cosTheta)
        )
        transmittanceToGround.assign(
          getTransmittance(
            parameters,
            transmittanceTexture,
            radius,
            cosTheta,
            distanceToGround,
            bool(true)
          )
        )
        groundAlbedo.assign(parameters.groundAlbedo)
      })

      Loop({ start: 0, end: mul(SAMPLE_COUNT, 2) }, ({ i: m }) => {
        const phi = float(m).add(0.5).mul(deltaPhi).toVar()
        const omegaI = vec3(
          cos(phi).mul(sinTheta),
          sin(phi).mul(sinTheta),
          cosTheta
        ).toVar()
        const deltaOmegaI = deltaTheta.mul(deltaPhi).mul(sin(theta)).toVar()

        // The radiance arriving from direction omegaI after n-1 bounces is the
        // sum of a term given by the precomputed scattering texture for the
        // (n-1)-th order:
        const cosViewSun1 = omegaSun.dot(omegaI)
        const incidentRadiance = getScatteringForOrder(
          parameters,
          singleRayleighScatteringTexture,
          singleMieScatteringTexture,
          multipleScatteringTexture,
          radius,
          omegaI.z,
          cosSun,
          cosViewSun1,
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
          parameters,
          irradianceTexture,
          parameters.bottomRadius,
          groundNormal.dot(omegaSun)
        )
        incidentRadiance.addAssign(
          transmittanceToGround.mul(groundAlbedo).div(PI).mul(groundIrradiance)
        )

        // The radiance finally scattered from direction omegaI towards
        // direction -omega is the product of the incident radiance, the
        // scattering coefficient, and the phase function for directions omega
        // and omegaI (all this summed over all particle types, i.e. Rayleigh
        // and Mie).
        const cosViewSun2 = omega.dot(omegaI).toVar()
        const rayleighDensity = getProfileDensity(
          parameters.rayleighDensity,
          radius.sub(parameters.bottomRadius)
        )
        const mieDensity = getProfileDensity(
          parameters.mieDensity,
          radius.sub(parameters.bottomRadius)
        )
        radiance.addAssign(
          incidentRadiance.mul(
            add(
              mul(
                parameters.rayleighScattering,
                rayleighDensity,
                rayleighPhaseFunction(cosViewSun2)
              ),
              mul(
                parameters.mieScattering,
                mieDensity,
                miePhaseFunction(parameters.miePhaseFunctionG, cosViewSun2)
              )
            ),
            deltaOmegaI
          )
        )
      })
    })

    return radiance
  }
)

const computeMultipleScattering = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    scatteringDensityTexture: NodeObject<ScatteringDensityTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>
  ): Node<RadianceSpectrum> => {
    const SAMPLE_COUNT = 50
    const stepSize = distanceToNearestAtmosphereBoundary(
      parameters,
      radius,
      cosView,
      rayIntersectsGround
    )
      .div(SAMPLE_COUNT)
      .toVar()

    const radianceSum = vec3(0).toVar()
    Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
      const rayLength = float(i).mul(stepSize)

      // The radius, cosView and cosSun parameters at the current integration
      // point (see the single scattering section for a detailed explanation).
      const radiusI = clampRadius(
        parameters,
        sqrt(
          rayLength
            .mul(rayLength)
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.mul(radius))
        )
      )
      const cosViewI = clampCosine(
        radius.mul(cosView).add(rayLength).div(radiusI)
      )
      const cosSunI = clampCosine(
        radius.mul(cosSun).add(rayLength.mul(cosViewSun)).div(radiusI)
      )

      // The Rayleigh and Mie multiple scattering at the current sample point.
      const radiance = getScattering(
        parameters,
        scatteringDensityTexture,
        radiusI,
        cosViewI,
        cosSunI,
        cosViewSun,
        rayIntersectsGround
      )
        .mul(
          getTransmittance(
            parameters,
            transmittanceTexture,
            radius,
            cosView,
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
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    singleRayleighScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    multipleScatteringTexture: NodeObject<ScatteringTextureNode>,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    fragCoord: NodeObject<'vec3'>,
    scatteringOrder: NodeObject<'int'>
  ): Node<RadianceDensitySpectrum> => {
    const scatteringParams = getParamsFromScatteringTextureFragCoord(
      parameters,
      fragCoord
    ).toVar()
    const radius = scatteringParams.get('radius')
    const cosView = scatteringParams.get('cosView')
    const cosSun = scatteringParams.get('cosSun')
    const cosViewSun = scatteringParams.get('cosViewSun')
    return computeScatteringDensity(
      parameters,
      transmittanceTexture,
      singleRayleighScatteringTexture,
      singleMieScatteringTexture,
      multipleScatteringTexture,
      irradianceTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      scatteringOrder
    )
  }
)

const multipleScatteringStruct = /*#__PURE__*/ struct({
  radiance: RadianceSpectrum,
  cosViewSun: Dimensionless
})
type MultipleScatteringStruct = ReturnType<typeof multipleScatteringStruct>

export const computeMultipleScatteringTexture = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    scatteringDensityTexture: NodeObject<ScatteringDensityTextureNode>,
    fragCoord: NodeObject<'vec3'>
  ): MultipleScatteringStruct => {
    const scatteringParams = getParamsFromScatteringTextureFragCoord(
      parameters,
      fragCoord
    ).toVar()
    const radius = scatteringParams.get('radius')
    const cosView = scatteringParams.get('cosView')
    const cosSun = scatteringParams.get('cosSun')
    const cosViewSun = scatteringParams.get('cosViewSun')
    const rayIntersectsGround = scatteringParams.get('rayIntersectsGround')
    const radiance = computeMultipleScattering(
      parameters,
      transmittanceTexture,
      scatteringDensityTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    )
    return multipleScatteringStruct(radiance, cosViewSun)
  }
)

const computeDirectIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    radius: NodeObject<Length>,
    cosSun: NodeObject<Dimensionless>
  ): Node<IrradianceSpectrum> => {
    const alpha = parameters.sunAngularRadius

    // Approximate average of the cosine factor cosSun over the visible fraction
    // of the Sun disc.
    const averageCosineFactor = select(
      cosSun.lessThan(alpha.negate()),
      0,
      select(
        cosSun.greaterThan(alpha),
        cosSun,
        cosSun.add(alpha).pow2().div(alpha.mul(4))
      )
    )

    return parameters.solarIrradiance
      .mul(
        getTransmittanceToTopAtmosphereBoundary(
          parameters,
          transmittanceTexture,
          radius,
          cosSun
        )
      )
      .mul(averageCosineFactor)
  }
)

const computeIndirectIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    singleRayleighScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    multipleScatteringTexture: NodeObject<ScatteringTextureNode>,
    radius: NodeObject<Length>,
    cosSun: NodeObject<Dimensionless>,
    scatteringOrder: NodeObject<'int'>
  ): Node<IrradianceSpectrum> => {
    const SAMPLE_COUNT = 32
    const deltaPhi = PI.div(SAMPLE_COUNT).toConst()
    const deltaTheta = PI.div(SAMPLE_COUNT).toConst()

    const result = vec3(0).toVar()
    const omegaSun = vec3(sqrt(cosSun.pow2().oneMinus()), 0, cosSun).toVar()

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
        const cosViewSun = omega.dot(omegaSun)
        result.addAssign(
          getScatteringForOrder(
            parameters,
            singleRayleighScatteringTexture,
            singleMieScatteringTexture,
            multipleScatteringTexture,
            radius,
            omega.z,
            cosSun,
            cosViewSun,
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

const irradianceParamsStruct = /*#__PURE__*/ struct({
  radius: Length,
  cosSun: Dimensionless
})
type IrradianceParamsStruct = ReturnType<typeof irradianceParamsStruct>

const getParamsFromIrradianceTextureUV = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    uv: NodeObject<'vec2'>
  ): IrradianceParamsStruct => {
    const cosSunUnit = getUnitRangeFromTextureCoord(
      uv.x,
      parameters.irradianceTextureSize.x
    )
    const radiusUnit = getUnitRangeFromTextureCoord(
      uv.y,
      parameters.irradianceTextureSize.y
    )
    const radius = parameters.bottomRadius.add(
      radiusUnit.mul(parameters.topRadius.sub(parameters.bottomRadius))
    )
    const cosSun = clampCosine(cosSunUnit.mul(2).sub(1))
    return irradianceParamsStruct(radius, cosSun)
  }
)

export const computeDirectIrradianceTexture = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    fragCoord: NodeObject<'vec2'>
  ): Node<IrradianceSpectrum> => {
    const irradianceParams = getParamsFromIrradianceTextureUV(
      parameters,
      fragCoord.div(vec2(parameters.irradianceTextureSize))
    ).toVar()
    const radius = irradianceParams.get('radius')
    const cosSun = irradianceParams.get('cosSun')
    return computeDirectIrradiance(
      parameters,
      transmittanceTexture,
      radius,
      cosSun
    )
  }
)

export const computeIndirectIrradianceTexture = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    singleRayleighScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    multipleScatteringTexture: NodeObject<ScatteringTextureNode>,
    fragCoord: NodeObject<'vec2'>,
    scatteringOrder: NodeObject<'int'>
  ): Node<IrradianceSpectrum> => {
    const irradianceParams = getParamsFromIrradianceTextureUV(
      parameters,
      fragCoord.div(vec2(parameters.irradianceTextureSize))
    ).toVar()
    const radius = irradianceParams.get('radius')
    const cosSun = irradianceParams.get('cosSun')
    return computeIndirectIrradiance(
      parameters,
      singleRayleighScatteringTexture,
      singleMieScatteringTexture,
      multipleScatteringTexture,
      radius,
      cosSun,
      scatteringOrder
    )
  }
)
