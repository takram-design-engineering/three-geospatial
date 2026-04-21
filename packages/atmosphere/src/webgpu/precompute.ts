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
  min,
  mul,
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
  distanceToTopAtmosphereBoundary,
  getProfileDensity
} from './common'
import {
  Dimensionless,
  DimensionlessSpectrum,
  IrradianceSpectrum,
  Length,
  ReducedScatteringTexture,
  ScatteringTexture
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
