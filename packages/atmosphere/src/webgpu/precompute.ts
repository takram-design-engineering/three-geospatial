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
  cos,
  exp,
  float,
  Loop,
  mul,
  sin,
  sqrt,
  vec2,
  vec3
} from 'three/tsl'
import type { Texture3DNode } from 'three/webgpu'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  atmosphereParametersStruct,
  densityProfileStruct,
  getAtmosphereContextBase,
  makeDestructible
} from './AtmosphereContextBase'
import {
  clampCosine,
  distanceToTopAtmosphereBoundary,
  getCombinedScattering,
  getProfileDensity,
  getUnitRangeFromTextureCoord,
  miePhaseFunction,
  rayleighPhaseFunction
} from './common'
import {
  Dimensionless,
  DimensionlessSpectrum,
  Length,
  type IrradianceSpectrum
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
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, radius, cosView]) => {
  const {
    rayleighDensity,
    rayleighScattering,
    mieDensity,
    mieExtinction,
    absorptionDensity,
    absorptionExtinction
  } = makeDestructible(parameters)

  const rayleighOpticalDepth = computeOpticalDepthToTopAtmosphereBoundary(
    parameters,
    rayleighDensity,
    radius,
    cosView
  )
  const mieOpticalDepth = computeOpticalDepthToTopAtmosphereBoundary(
    parameters,
    mieDensity,
    radius,
    cosView
  )
  const absorptionOpticalDepth = computeOpticalDepthToTopAtmosphereBoundary(
    parameters,
    absorptionDensity,
    radius,
    cosView
  )
  const opticalDepth = add(
    rayleighScattering.mul(rayleighOpticalDepth),
    mieExtinction.mul(mieOpticalDepth),
    absorptionExtinction.mul(absorptionOpticalDepth)
  ).toConst()

  return exp(opticalDepth.negate())
})

const getParamsFromTransmittanceTextureUV = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromTransmittanceTextureUV',
  type: 'vec2',
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
  return vec2(radius, cosView)
})

export const computeTransmittanceTexture = /*#__PURE__*/ FnVar(
  (fragCoord: Node<'vec2'>) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const { transmittanceTextureSize } = parametersNode

      const transmittanceParams = getParamsFromTransmittanceTextureUV(
        parametersNode,
        fragCoord.div(transmittanceTextureSize)
      ).toConst()
      const radius = transmittanceParams.x
      const cosView = transmittanceParams.y
      return computeTransmittanceToTopAtmosphereBoundary(
        parametersNode,
        radius,
        cosView
      )
    }
)

const computeIrradiance = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    scatteringNode: Texture3DNode,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ): Node<IrradianceSpectrum> => {
    const { miePhaseFunctionG } = makeDestructible(parameters)

    const sampleCount = 32
    const deltaPhi = Math.PI / sampleCount
    const deltaTheta = Math.PI / sampleCount

    const result = vec3(0).toVar()
    const omegaLight = vec3(
      sqrt(cosLight.pow2().oneMinus()),
      0,
      cosLight
    ).toConst()

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
        const cosViewLight = omega.dot(omegaLight)

        const scattering = getCombinedScattering(
          parameters,
          scatteringNode,
          scatteringNode,
          radius,
          omega.z,
          cosLight,
          cosViewLight,
          bool(false)
        )
        const rayleigh = scattering.get('scattering')
        const mie = scattering.get('singleMieScattering')
        result.addAssign(
          add(
            rayleigh.mul(rayleighPhaseFunction(cosViewLight)),
            mie.mul(miePhaseFunction(miePhaseFunctionG, cosViewLight))
          ).mul(omega.z, deltaOmega)
        )
      })
    })

    return result
  }
)

const getParamsFromIrradianceTextureUV = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromIrradianceTextureUV',
  type: 'vec2',
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
  return vec2(radius, cosLight)
})

export const computeIrradianceTexture = /*#__PURE__*/ FnVar(
  (scatteringNode: Texture3DNode, fragCoord: Node<'vec2'>) =>
    (builder): ReturnType<typeof computeIrradiance> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const { irradianceTextureSize } = parametersNode

      const irradianceParams = getParamsFromIrradianceTextureUV(
        parametersNode,
        fragCoord.div(irradianceTextureSize)
      ).toConst()
      const radius = irradianceParams.x
      const cosLight = irradianceParams.y
      return computeIrradiance(parametersNode, scatteringNode, radius, cosLight)
    }
)
