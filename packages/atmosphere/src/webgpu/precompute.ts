// Based on: https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl

/**
 * Copyright (c) 2017 Eric Bruneton. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
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
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * Precomputed Atmospheric Scattering
 *
 * Copyright (c) 2008 INRIA. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
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
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

import {
  add,
  bool,
  clamp,
  cos,
  exp,
  float,
  floor,
  If,
  Loop,
  max,
  min,
  mul,
  PI,
  sin,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  atmosphereParametersStruct,
  densityProfileStruct,
  getAtmosphereContextBase,
  makeDestructible
} from './AtmosphereContextBase'
import {
  clampCosine,
  clampRadius,
  distanceToBottomAtmosphereBoundary,
  distanceToTopAtmosphereBoundary,
  getIrradiance,
  getProfileDensity,
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
  IrradianceSpectrum,
  IrradianceTexture,
  Length,
  RadianceDensitySpectrum,
  RadianceSpectrum,
  ReducedScatteringTexture,
  ScatteringDensityTexture,
  ScatteringTexture,
  TransmittanceTexture
} from './dimensional'

const computeOpticalDepthToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'computeOpticalDepthToTopAtmosphereBoundary',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'profile', type: densityProfileStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, profile, radius, cosView]) => {
  const { bottomRadius } = makeDestructible(parameters)

  const sampleCount = 500
  const stepSize = distanceToTopAtmosphereBoundary(parameters, radius, cosView)
    .div(sampleCount)
    .toConst()

  const opticalDepth = float(0).toVar()
  Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
    const rayLength = float(i).mul(stepSize).toConst()

    // Distance between the current sample point and the planet center.
    const r = sqrt(
      add(rayLength.pow2(), mul(2, radius, cosView, rayLength), radius.pow2())
    ).toConst()

    // Number density at the current sample point (divided by the number
    // density at the bottom of the atmosphere, yielding a dimensionless
    // number).
    const y = getProfileDensity(profile, r.sub(bottomRadius))

    // Sample weight from the trapezoidal rule.
    const weight = vec2(i).equal(vec2(0, sampleCount)).any().select(0.5, 1)
    opticalDepth.addAssign(y.mul(weight).mul(stepSize))
  })

  return opticalDepth
})

const computeTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'computeTransmittanceToTopAtmosphereBoundary',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'transmittancePrecisionLog', type: 'bool' }
  ]
})(([parameters, radius, cosView, transmittancePrecisionLog]) => {
  const {
    rayleighDensity,
    rayleighScattering,
    mieDensity,
    mieExtinction,
    absorptionDensity,
    absorptionExtinction
  } = makeDestructible(parameters)

  const opticalDepth = add(
    rayleighScattering.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        parameters,
        rayleighDensity,
        radius,
        cosView
      )
    ),
    mieExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        parameters,
        mieDensity,
        radius,
        cosView
      )
    ),
    absorptionExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        parameters,
        absorptionDensity,
        radius,
        cosView
      )
    )
  ).toConst()

  return transmittancePrecisionLog.select(
    opticalDepth,
    exp(opticalDepth.negate())
  )
})

const getUnitRangeFromTextureCoord = /*#__PURE__*/ FnLayout({
  name: 'getUnitRangeFromTextureCoord',
  type: 'float',
  inputs: [
    { name: 'coord', type: 'float' },
    { name: 'textureSize', type: 'float' }
  ]
})(([coord, textureSize]) => {
  const texelSize = textureSize.reciprocal()
  return coord.sub(texelSize.mul(0.5)).div(texelSize.oneMinus())
})

const transmittanceParamsStruct = /*#__PURE__*/ struct(
  {
    radius: Length,
    cosView: Dimensionless
  },
  'TransmittanceParams'
)

const getParamsFromTransmittanceTextureUV = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromTransmittanceTextureUV',
  type: transmittanceParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'uv', type: 'vec2' }
  ]
})(([parameters, uv]) => {
  const { topRadius, bottomRadius, transmittanceTextureSize } =
    makeDestructible(parameters)

  const cosViewUnit = getUnitRangeFromTextureCoord(
    uv.x,
    transmittanceTextureSize.x
  )
  const radiusUnit = getUnitRangeFromTextureCoord(
    uv.y,
    transmittanceTextureSize.y
  )

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toConst()

  // Distance to the horizon, from which we can compute radius.
  const distanceToHorizon = H.mul(radiusUnit).toConst()
  const radius = sqrt(distanceToHorizon.pow2().add(bottomRadius.pow2()))

  // Distance to the top atmosphere boundary for the ray (radius, cosView),
  // and its minimum and maximum values over all cosView - obtained for
  // (radius, 1) and (radius, cosHorizon) - from which we can recover cosView.
  const minDistance = topRadius.sub(radius).toConst()
  const maxDistance = distanceToHorizon.add(H)
  const distance = minDistance
    .add(cosViewUnit.mul(maxDistance.sub(minDistance)))
    .toConst()
  const cosView = distance.equal(0).select(
    1,
    H.pow2()
      .sub(distanceToHorizon.pow2())
      .sub(distance.pow2())
      .div(mul(2, radius, distance))
  )
  return transmittanceParamsStruct(radius, cosView)
})

export const computeTransmittanceToTopAtmosphereBoundaryTexture =
  /*#__PURE__*/ FnVar(
    (fragCoord: Node<'vec2'>) =>
      (builder): Node<DimensionlessSpectrum> => {
        const context = getAtmosphereContextBase(builder)
        const { transmittanceTextureSize } = context.parametersNode

        const transmittanceParams = getParamsFromTransmittanceTextureUV(
          context.parametersNode,
          fragCoord.div(transmittanceTextureSize)
        ).toConst()
        return computeTransmittanceToTopAtmosphereBoundary(
          context.parametersNode,
          transmittanceParams.get('radius'),
          transmittanceParams.get('cosView'),
          bool(context.parameters.transmittancePrecisionLog)
        )
      }
  )

const singleScatteringStruct = /*#__PURE__*/ struct(
  {
    rayleigh: DimensionlessSpectrum,
    mie: DimensionlessSpectrum
  },
  'SingleScattering'
)

const computeSingleScatteringIntegrand = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeSingleScatteringIntegrand',
  type: singleScatteringStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'rayLength', type: Length },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  parameters,
  transmittanceTexture,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  rayLength,
  viewRayIntersectsGround
]) => {
  const { bottomRadius, rayleighDensity, mieDensity } =
    makeDestructible(parameters)

  const radiusEnd = clampRadius(
    parameters,
    sqrt(
      rayLength
        .pow2()
        .add(mul(2, radius, cosView, rayLength))
        .add(radius.pow2())
    )
  ).toConst()
  const cosLightEnd = clampCosine(
    radius.mul(cosLight).add(rayLength.mul(cosViewLight)).div(radiusEnd)
  )
  const transmittance = getTransmittance(
    transmittanceTexture,
    radius,
    cosView,
    rayLength,
    viewRayIntersectsGround
  )
    .mul(getTransmittanceToSun(transmittanceTexture, radiusEnd, cosLightEnd))
    .toConst()

  const rayleigh = transmittance.mul(
    getProfileDensity(rayleighDensity, radiusEnd.sub(bottomRadius))
  )
  const mie = transmittance.mul(
    getProfileDensity(mieDensity, radiusEnd.sub(bottomRadius))
  )
  return singleScatteringStruct(rayleigh, mie)
})

const distanceToNearestAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'distanceToNearestAtmosphereBoundary',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([parameters, radius, cosView, viewRayIntersectsGround]) => {
  const result = float(0).toVar()
  If(viewRayIntersectsGround, () => {
    result.assign(
      distanceToBottomAtmosphereBoundary(parameters, radius, cosView)
    )
  }).Else(() => {
    result.assign(distanceToTopAtmosphereBoundary(parameters, radius, cosView))
  })
  return result
})

const computeSingleScattering = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeSingleScattering',
  type: singleScatteringStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  parameters,
  transmittanceTexture,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  viewRayIntersectsGround
]) => {
  const { solarIrradiance, rayleighScattering, mieScattering } =
    makeDestructible(parameters)

  const sampleCount = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    parameters,
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(sampleCount)
    .toConst()

  const rayleighSum = vec3(0).toVar()
  const mieSum = vec3(0).toVar()
  Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
    const rayLength = float(i).mul(stepSize).toConst()

    // The Rayleigh and Mie single scattering at the current sample point.
    const deltaRayleighMie = computeSingleScatteringIntegrand(
      parameters,
      transmittanceTexture,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      rayLength,
      viewRayIntersectsGround
    ).toConst()
    const deltaRayleigh = deltaRayleighMie.get('rayleigh')
    const deltaMie = deltaRayleighMie.get('mie')

    // Sample weight from the trapezoidal rule.
    const weight = vec2(i).equal(vec2(0, sampleCount)).any().select(0.5, 1)
    rayleighSum.addAssign(deltaRayleigh.mul(weight))
    mieSum.addAssign(deltaMie.mul(weight))
  })

  const rayleigh = mul(
    rayleighSum,
    stepSize,
    solarIrradiance,
    rayleighScattering
  )
  const mie = mul(mieSum, stepSize, solarIrradiance, mieScattering)
  return singleScatteringStruct(rayleigh, mie)
})

const scatteringParamsStruct = /*#__PURE__*/ struct(
  {
    radius: Length,
    cosView: Dimensionless,
    cosLight: Dimensionless,
    cosViewLight: Dimensionless,
    viewRayIntersectsGround: 'bool'
  },
  'ScatteringParams'
)

const getParamsFromScatteringTextureCoord = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromScatteringTextureCoord',
  type: scatteringParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'coord', type: 'vec4' }
  ]
})(([parameters, coord]) => {
  const {
    bottomRadius,
    topRadius,
    minCosLight,
    scatteringTextureRadiusSize,
    scatteringTextureCosViewSize,
    scatteringTextureCosLightSize
  } = makeDestructible(parameters)

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toConst()

  // Distance to the horizon.
  const distanceToHorizon = H.mul(
    getUnitRangeFromTextureCoord(coord.w, scatteringTextureRadiusSize)
  ).toConst()
  const radius = sqrt(distanceToHorizon.pow2().add(bottomRadius.pow2()))

  const cosView = float(0).toVar()
  const viewRayIntersectsGround = bool().toVar()
  If(coord.z.lessThan(0.5), () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon) - from which we can recover cosView.
    const minDistance = radius.sub(bottomRadius).toConst()
    const maxDistance = distanceToHorizon
    const distance = minDistance
      .add(
        maxDistance
          .sub(minDistance)
          .mul(
            getUnitRangeFromTextureCoord(
              coord.z.mul(2).oneMinus(),
              scatteringTextureCosViewSize.div(2)
            )
          )
      )
      .toConst()
    cosView.assign(
      distance.equal(0).select(
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
    viewRayIntersectsGround.assign(bool(true))
  }).Else(() => {
    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon) - from which we can recover
    // cosView.
    const minDistance = topRadius.sub(radius).toConst()
    const maxDistance = distanceToHorizon.add(H)
    const distance = minDistance
      .add(
        maxDistance
          .sub(minDistance)
          .mul(
            getUnitRangeFromTextureCoord(
              coord.z.mul(2).sub(1),
              scatteringTextureCosViewSize.div(2)
            )
          )
      )
      .toConst()
    cosView.assign(
      distance.equal(0).select(
        1,
        clampCosine(
          H.pow2()
            .sub(distanceToHorizon.pow2())
            .sub(distance.pow2())
            .div(mul(2, radius, distance))
        )
      )
    )
    viewRayIntersectsGround.assign(bool(false))
  })

  const cosLightUnit = getUnitRangeFromTextureCoord(
    coord.y,
    scatteringTextureCosLightSize
  ).toConst()
  const minDistance = topRadius.sub(bottomRadius).toConst()
  const maxDistance = H
  const D = distanceToTopAtmosphereBoundary(
    parameters,
    bottomRadius,
    minCosLight
  )
  const A = D.remap(minDistance, maxDistance).toConst()
  const a = A.sub(cosLightUnit.mul(A)).div(cosLightUnit.mul(A).add(1))
  const distance = minDistance
    .add(min(a, A).mul(maxDistance.sub(minDistance)))
    .toConst()
  const cosLight = distance.equal(0).select(
    1,
    clampCosine(
      H.pow2()
        .sub(distance.pow2())
        .div(mul(2, bottomRadius, distance))
    )
  )
  const cosViewLight = clampCosine(coord.x.mul(2).sub(1))

  return scatteringParamsStruct(
    radius,
    cosView,
    cosLight,
    cosViewLight,
    viewRayIntersectsGround
  )
})

const getParamsFromScatteringTextureFragCoord = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromScatteringTextureFragCoord',
  type: scatteringParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'fragCoord', type: 'vec3' }
  ]
})(([parameters, fragCoord]) => {
  const {
    scatteringTextureRadiusSize,
    scatteringTextureCosViewSize,
    scatteringTextureCosLightSize,
    scatteringTextureCosViewLightSize
  } = makeDestructible(parameters)

  const fragCoordCosViewLight = floor(
    fragCoord.x.div(scatteringTextureCosLightSize)
  )
  const fragCoordCosLight = fragCoord.x.mod(scatteringTextureCosLightSize)
  const size = vec4(
    scatteringTextureCosViewLightSize.sub(1),
    scatteringTextureCosLightSize,
    scatteringTextureCosViewSize,
    scatteringTextureRadiusSize
  )
  const coord = vec4(
    fragCoordCosViewLight,
    fragCoordCosLight,
    fragCoord.y,
    fragCoord.z
  ).div(size)
  const scatteringParams = getParamsFromScatteringTextureCoord(
    parameters,
    coord
  ).toConst()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosLight = scatteringParams.get('cosLight')
  const cosViewLight = scatteringParams.get('cosViewLight').toVar()
  const viewRayIntersectsGround = scatteringParams.get(
    'viewRayIntersectsGround'
  )

  // Clamp cosViewLight to its valid range of values, given cosView and cosLight.
  const sideRange = sqrt(
    cosView.pow2().oneMinus().mul(cosLight.pow2().oneMinus())
  ).toConst()
  cosViewLight.assign(
    clamp(
      cosViewLight,
      cosView.mul(cosLight).sub(sideRange),
      cosView.mul(cosLight).add(sideRange)
    )
  )
  return scatteringParamsStruct(
    radius,
    cosView,
    cosLight,
    cosViewLight,
    viewRayIntersectsGround
  )
})

export const computeSingleScatteringTexture = /*#__PURE__*/ FnVar(
  (transmittanceTexture: TransmittanceTexture, fragCoord: Node<'vec3'>) =>
    builder => {
      const context = getAtmosphereContextBase(builder)

      const scatteringParams = getParamsFromScatteringTextureFragCoord(
        context.parametersNode,
        fragCoord
      ).toConst()
      const radius = scatteringParams.get('radius')
      const cosView = scatteringParams.get('cosView')
      const cosLight = scatteringParams.get('cosLight')
      const cosViewLight = scatteringParams.get('cosViewLight')
      const viewRayIntersectsGround = scatteringParams.get(
        'viewRayIntersectsGround'
      )
      return computeSingleScattering(
        context.parametersNode,
        transmittanceTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        viewRayIntersectsGround
      )
    }
)

const getScatteringForOrder = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getScatteringForOrder',
  type: RadianceSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' },
    { name: 'scatteringOrder', type: 'int' }
  ]
})(([
  parameters,
  singleRayleighScatteringTexture,
  singleMieScatteringTexture,
  multipleScatteringTexture,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  viewRayIntersectsGround,
  scatteringOrder
]) => {
  const { miePhaseFunctionG } = makeDestructible(parameters)

  const result = vec3(0).toVar()
  If(scatteringOrder.equal(1), () => {
    const rayleigh = getScattering(
      singleRayleighScatteringTexture,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      viewRayIntersectsGround
    )
    const mie = getScattering(
      singleMieScatteringTexture,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      viewRayIntersectsGround
    )
    result.assign(
      add(
        rayleigh.mul(rayleighPhaseFunction(cosViewLight)),
        mie.mul(miePhaseFunction(miePhaseFunctionG, cosViewLight))
      )
    )
  }).Else(() => {
    result.assign(
      getScattering(
        multipleScatteringTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        viewRayIntersectsGround
      )
    )
  })
  return result
})

const computeScatteringDensity = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeScatteringDensity',
  type: RadianceDensitySpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'scatteringOrder', type: 'int' }
  ]
})(([
  parameters,
  transmittanceTexture,
  singleRayleighScatteringTexture,
  singleMieScatteringTexture,
  multipleScatteringTexture,
  irradianceTexture,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  scatteringOrder
]) => {
  const {
    bottomRadius,
    rayleighDensity,
    rayleighScattering,
    mieDensity,
    mieScattering,
    miePhaseFunctionG,
    groundAlbedo
  } = makeDestructible(parameters)

  // Compute unit direction vectors for the zenith, the view direction omega
  // and the sun direction omegaSun, such that the cosine of the view-zenith
  // angle is cosView, the cosine of the sun-zenith angle is cosLight, and
  // the cosine of the view-sun angle is cosViewLight. The goal is to simplify
  // computations below.
  const zenithDirection = vec3(0, 0, 1)
  const omega = vec3(sqrt(cosView.pow2().oneMinus()), 0, cosView).toConst()
  const sunDirectionX = omega.x
    .equal(0)
    .select(0, cosViewLight.sub(cosView.mul(cosLight)).div(omega.x))
    .toConst()
  const sunDirectionY = sqrt(
    max(sunDirectionX.pow2().add(cosLight.pow2()).oneMinus(), 0)
  )
  const omegaSun = vec3(sunDirectionX, sunDirectionY, cosLight).toConst()
  const sampleCount = 16
  const deltaPhi = Math.PI / sampleCount
  const deltaTheta = Math.PI / sampleCount
  const radiance = vec3(0).toVar()

  // Nested loops for the integral over all the incident directions omegaI.
  // @ts-expect-error Missing type on custom name
  Loop({ start: 0, end: sampleCount, name: 'l' }, ({ l }) => {
    const theta = float(l).add(0.5).mul(deltaTheta).toConst()
    const cosTheta = cos(theta).toConst()
    const sinTheta = sin(theta).toConst()
    const omegaRayIntersectsGround = rayIntersectsGround(
      parameters,
      radius,
      cosTheta
    ).toConst()

    // The distance and transmittance to the ground only depend on theta, so
    // we can compute them in the outer loop for efficiency.
    const distanceToGround = float(0).toVar()
    const transmittanceToGround = vec3(0).toVar()
    const rayGroundAlbedo = vec3(0).toVar()
    If(omegaRayIntersectsGround, () => {
      distanceToGround.assign(
        distanceToBottomAtmosphereBoundary(parameters, radius, cosTheta)
      )
      transmittanceToGround.assign(
        getTransmittance(
          transmittanceTexture,
          radius,
          cosTheta,
          distanceToGround,
          bool(true)
        )
      )
      rayGroundAlbedo.assign(groundAlbedo)
    })

    // @ts-expect-error Missing type on custom name
    Loop({ start: 0, end: mul(sampleCount, 2), name: 'm' }, ({ m }) => {
      const phi = float(m).add(0.5).mul(deltaPhi).toConst()
      const omegaI = vec3(
        cos(phi).mul(sinTheta),
        sin(phi).mul(sinTheta),
        cosTheta
      ).toConst()
      const deltaOmegaI = sin(theta).mul(deltaTheta).mul(deltaPhi).toConst()

      // The radiance arriving from direction omegaI after n-1 bounces is the
      // sum of a term given by the precomputed scattering texture for the
      // (n-1)-th order:
      const cosViewLight1 = omegaSun.dot(omegaI)
      const incidentRadiance = getScatteringForOrder(
        parameters,
        singleRayleighScatteringTexture,
        singleMieScatteringTexture,
        multipleScatteringTexture,
        radius,
        omegaI.z,
        cosLight,
        cosViewLight1,
        omegaRayIntersectsGround,
        scatteringOrder.sub(1)
      ).toVar()

      // and of the contribution from the light paths with n-1 bounces and
      // whose last bounce is on the ground. This contribution is the product
      // of the transmittance to the ground, the ground albedo, the ground
      // BRDF, and the irradiance received on the ground after n-2 bounces.
      const groundNormal = zenithDirection
        .mul(radius)
        .add(omegaI.mul(distanceToGround))
        .normalize()
      const groundIrradiance = getIrradiance(
        irradianceTexture,
        bottomRadius,
        groundNormal.dot(omegaSun)
      )
      incidentRadiance.addAssign(
        transmittanceToGround.mul(rayGroundAlbedo).div(PI).mul(groundIrradiance)
      )

      // The radiance finally scattered from direction omegaI towards
      // direction -omega is the product of the incident radiance, the
      // scattering coefficient, and the phase function for directions omega
      // and omegaI (all this summed over all particle types, i.e. Rayleigh
      // and Mie).
      const cosViewLight2 = omega.dot(omegaI).toConst()
      const rayleighDensityValue = getProfileDensity(
        rayleighDensity,
        radius.sub(bottomRadius)
      )
      const mieDensityValue = getProfileDensity(
        mieDensity,
        radius.sub(bottomRadius)
      )
      radiance.addAssign(
        incidentRadiance.mul(
          add(
            mul(
              rayleighScattering,
              rayleighDensityValue,
              rayleighPhaseFunction(cosViewLight2)
            ),
            mul(
              mieScattering,
              mieDensityValue,
              miePhaseFunction(miePhaseFunctionG, cosViewLight2)
            )
          ),
          deltaOmegaI
        )
      )
    })
  })

  return radiance
})

const computeMultipleScattering = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeMultipleScattering',
  type: RadianceSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringDensityTexture', type: ScatteringDensityTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  parameters,
  transmittanceTexture,
  scatteringDensityTexture,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  viewRayIntersectsGround
]) => {
  const sampleCount = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    parameters,
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(sampleCount)
    .toConst()

  const radianceSum = vec3(0).toVar()
  Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
    const rayLength = float(i).mul(stepSize).toConst()

    // The radius, cosView and cosLight parameters at the current integration
    // point (see the single scattering section for a detailed explanation).
    const radiusI = clampRadius(
      parameters,
      sqrt(
        rayLength
          .pow2()
          .add(mul(2, radius, cosView, rayLength))
          .add(radius.pow2())
      )
    )
    const cosViewI = clampCosine(
      radius.mul(cosView).add(rayLength).div(radiusI)
    )
    const cosLightI = clampCosine(
      radius.mul(cosLight).add(rayLength.mul(cosViewLight)).div(radiusI)
    )

    // The Rayleigh and Mie multiple scattering at the current sample point.
    const radiance = getScattering(
      scatteringDensityTexture,
      radiusI,
      cosViewI,
      cosLightI,
      cosViewLight,
      viewRayIntersectsGround
    )
      .mul(
        getTransmittance(
          transmittanceTexture,
          radius,
          cosView,
          rayLength,
          viewRayIntersectsGround
        )
      )
      .mul(stepSize)

    // Sample weight from the trapezoidal rule.
    const weight = vec2(i).equal(vec2(0, sampleCount)).any().select(0.5, 1)
    radianceSum.addAssign(radiance.mul(weight))
  })

  return radianceSum
})

export const computeScatteringDensityTexture = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TransmittanceTexture,
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    irradianceTexture: IrradianceTexture,
    fragCoord: Node<'vec3'>,
    scatteringOrder: Node<'int'>
  ) =>
    (builder): Node<RadianceDensitySpectrum> => {
      const context = getAtmosphereContextBase(builder)

      const scatteringParams = getParamsFromScatteringTextureFragCoord(
        context.parametersNode,
        fragCoord
      ).toConst()
      const radius = scatteringParams.get('radius')
      const cosView = scatteringParams.get('cosView')
      const cosLight = scatteringParams.get('cosLight')
      const cosViewLight = scatteringParams.get('cosViewLight')
      return computeScatteringDensity(
        context.parametersNode,
        transmittanceTexture,
        singleRayleighScatteringTexture,
        singleMieScatteringTexture,
        multipleScatteringTexture,
        irradianceTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        scatteringOrder
      )
    }
)

const multipleScatteringStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    cosViewLight: Dimensionless
  },
  'MultipleScattering'
)

export const computeMultipleScatteringTexture = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TransmittanceTexture,
    scatteringDensityTexture: ScatteringDensityTexture,
    fragCoord: Node<'vec3'>
  ) =>
    builder => {
      const context = getAtmosphereContextBase(builder)

      const scatteringParams = getParamsFromScatteringTextureFragCoord(
        context.parametersNode,
        fragCoord
      ).toConst()
      const radius = scatteringParams.get('radius')
      const cosView = scatteringParams.get('cosView')
      const cosLight = scatteringParams.get('cosLight')
      const cosViewLight = scatteringParams.get('cosViewLight')
      const viewRayIntersectsGround = scatteringParams.get(
        'viewRayIntersectsGround'
      )
      const radiance = computeMultipleScattering(
        context.parametersNode,
        transmittanceTexture,
        scatteringDensityTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        viewRayIntersectsGround
      )
      return multipleScatteringStruct(radiance, cosViewLight)
    }
)

const computeDirectIrradiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeDirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosLight', type: Dimensionless }
  ]
})(([parameters, transmittanceTexture, radius, cosLight]) => {
  const { solarIrradiance, sunAngularRadius } = makeDestructible(parameters)

  // Approximate average of the cosine factor cosLight over the visible fraction
  // of the Sun disc.
  const alpha = sunAngularRadius
  const averageCosineFactor = cosLight
    .lessThan(alpha.negate())
    .select(
      0,
      cosLight
        .greaterThan(alpha)
        .select(cosLight, cosLight.add(alpha).pow2().div(alpha.mul(4)))
    )

  return solarIrradiance
    .mul(
      getTransmittanceToTopAtmosphereBoundary(
        transmittanceTexture,
        radius,
        cosLight
      )
    )
    .mul(averageCosineFactor)
})

const computeIndirectIrradiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'computeIndirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosLight', type: Dimensionless },
    { name: 'scatteringOrder', type: 'int' }
  ]
})(([
  parameters,
  singleRayleighScatteringTexture,
  singleMieScatteringTexture,
  multipleScatteringTexture,
  radius,
  cosLight,
  scatteringOrder
]) => {
  const sampleCount = 32
  const deltaPhi = Math.PI / sampleCount
  const deltaTheta = Math.PI / sampleCount

  const result = vec3(0).toVar()
  const omegaSun = vec3(sqrt(cosLight.pow2().oneMinus()), 0, cosLight).toConst()

  // @ts-expect-error Missing type on custom name
  Loop({ start: 0, end: sampleCount / 2, name: 'j' }, ({ j }) => {
    const theta = float(j).add(0.5).mul(deltaTheta).toConst()

    Loop({ start: 0, end: sampleCount * 2 }, ({ i }) => {
      const phi = float(i).add(0.5).mul(deltaPhi).toConst()
      const omega = vec3(
        cos(phi).mul(sin(theta)),
        sin(phi).mul(sin(theta)),
        cos(theta)
      ).toConst()
      const deltaOmega = sin(theta).mul(deltaTheta * deltaPhi)
      const cosViewLight = omega.dot(omegaSun)
      result.addAssign(
        getScatteringForOrder(
          parameters,
          singleRayleighScatteringTexture,
          singleMieScatteringTexture,
          multipleScatteringTexture,
          radius,
          omega.z,
          cosLight,
          cosViewLight,
          bool(false),
          scatteringOrder
        )
          .mul(omega.z)
          .mul(deltaOmega)
      )
    })
  })

  return result
})

const irradianceParamsStruct = /*#__PURE__*/ struct(
  {
    radius: Length,
    cosLight: Dimensionless
  },
  'IrradianceParams'
)

const getParamsFromIrradianceTextureUV = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromIrradianceTextureUV',
  type: irradianceParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'uv', type: 'vec2' }
  ]
})(([parameters, uv]) => {
  const { topRadius, bottomRadius, irradianceTextureSize } =
    makeDestructible(parameters)

  const cosLightUnit = getUnitRangeFromTextureCoord(
    uv.x,
    irradianceTextureSize.x
  )
  const radiusUnit = getUnitRangeFromTextureCoord(uv.y, irradianceTextureSize.y)
  const radius = bottomRadius.add(radiusUnit.mul(topRadius.sub(bottomRadius)))
  const cosLight = clampCosine(cosLightUnit.mul(2).sub(1))
  return irradianceParamsStruct(radius, cosLight)
})

export const computeDirectIrradianceTexture = /*#__PURE__*/ FnVar(
  (transmittanceTexture: TransmittanceTexture, fragCoord: Node<'vec2'>) =>
    (builder): Node<IrradianceSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { irradianceTextureSize } = context.parametersNode

      const irradianceParams = getParamsFromIrradianceTextureUV(
        context.parametersNode,
        fragCoord.div(irradianceTextureSize)
      ).toConst()
      const radius = irradianceParams.get('radius')
      const cosLight = irradianceParams.get('cosLight')
      return computeDirectIrradiance(
        context.parametersNode,
        transmittanceTexture,
        radius,
        cosLight
      )
    }
)

export const computeIndirectIrradianceTexture = /*#__PURE__*/ FnVar(
  (
    singleRayleighScatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    multipleScatteringTexture: ScatteringTexture,
    fragCoord: Node<'vec2'>,
    scatteringOrder: Node<'int'>
  ) =>
    builder => {
      const context = getAtmosphereContextBase(builder)
      const { irradianceTextureSize } = context.parametersNode

      const irradianceParams = getParamsFromIrradianceTextureUV(
        context.parametersNode,
        fragCoord.div(irradianceTextureSize)
      ).toConst()
      const radius = irradianceParams.get('radius')
      const cosLight = irradianceParams.get('cosLight')
      return computeIndirectIrradiance(
        context.parametersNode,
        singleRayleighScatteringTexture,
        singleMieScatteringTexture,
        multipleScatteringTexture,
        radius,
        cosLight,
        scatteringOrder
      )
    }
)
