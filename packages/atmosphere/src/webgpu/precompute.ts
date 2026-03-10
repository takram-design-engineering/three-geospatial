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
  equal,
  exp,
  float,
  floor,
  If,
  Loop,
  max,
  min,
  mul,
  PI,
  select,
  sin,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  AtmosphereContextBaseNode,
  type DensityProfileLayerNodes,
  type DensityProfileNodes
} from './AtmosphereContextBaseNode'
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

const getLayerDensity = /*#__PURE__*/ FnVar(
  (
    layer: DensityProfileLayerNodes,
    altitude: Node<Length>
  ): Node<Dimensionless> => {
    return layer.expTerm
      .mul(exp(layer.expScale.mul(altitude)))
      .add(layer.linearTerm.mul(altitude))
      .add(layer.constantTerm)
      .saturate()
  }
)

const getProfileDensity = /*#__PURE__*/ FnVar(
  (
    profile: DensityProfileNodes,
    altitude: Node<Length>
  ): Node<Dimensionless> => {
    return select(
      altitude.lessThan(profile.layers[0].width),
      getLayerDensity(profile.layers[0], altitude),
      getLayerDensity(profile.layers[1], altitude)
    )
  }
)

const computeOpticalDepthToTopAtmosphereBoundary = /*#__PURE__*/ FnVar(
  (
    profile: DensityProfileNodes,
    radius: Node<Length>,
    cosView: Node<Dimensionless>
  ) =>
    (builder): Node<Length> => {
      const context = AtmosphereContextBaseNode.get(builder)
      const { bottomRadius } = context

      const sampleCount = 500
      const stepSize = distanceToTopAtmosphereBoundary(radius, cosView)
        .div(sampleCount)
        .toVar()

      const opticalDepth = float(0).toVar()
      Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
        const rayLength = float(i).mul(stepSize).toVar()

        // Distance between the current sample point and the planet center.
        const r = sqrt(
          add(
            rayLength.pow2(),
            mul(2, radius, cosView, rayLength),
            radius.pow2()
          )
        ).toVar()

        // Number density at the current sample point (divided by the number
        // density at the bottom of the atmosphere, yielding a dimensionless
        // number).
        const y = getProfileDensity(profile, r.sub(bottomRadius))

        // Sample weight from the trapezoidal rule.
        const weight = select(equal(i, 0).or(equal(i, sampleCount)), 0.5, 1)
        opticalDepth.addAssign(y.mul(weight).mul(stepSize))
      })

      return opticalDepth
    }
)

const computeTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'computeTransmittanceToTopAtmosphereBoundary',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const {
    parameters,
    rayleighDensity,
    rayleighScattering,
    mieDensity,
    mieExtinction,
    absorptionDensity,
    absorptionExtinction
  } = context

  const opticalDepth = add(
    rayleighScattering.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        rayleighDensity,
        radius,
        cosView
      )
    ),
    mieExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(mieDensity, radius, cosView)
    ),
    absorptionExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        absorptionDensity,
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
  'transmittanceParams'
)

const getParamsFromTransmittanceTextureUV = /*#__PURE__*/ FnLayout({
  typeOnly: true, // BUG: Fails with the struct return type in WebGL
  name: 'getParamsFromTransmittanceTextureUV',
  type: transmittanceParamsStruct,
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius } = context

  const cosViewUnit = getUnitRangeFromTextureCoord(
    uv.x,
    parameters.transmittanceTextureSize.x
  )
  const radiusUnit = getUnitRangeFromTextureCoord(
    uv.y,
    parameters.transmittanceTextureSize.y
  )

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toVar()

  // Distance to the horizon, from which we can compute radius.
  const distanceToHorizon = H.mul(radiusUnit).toVar()
  const radius = sqrt(distanceToHorizon.pow2().add(bottomRadius.pow2()))

  // Distance to the top atmosphere boundary for the ray (radius, cosView),
  // and its minimum and maximum values over all cosView - obtained for
  // (radius, 1) and (radius, cosHorizon) - from which we can recover cosView.
  const minDistance = topRadius.sub(radius).toVar()
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
      .div(mul(2, radius, distance))
  )
  return transmittanceParamsStruct(radius, cosView)
})

export const computeTransmittanceToTopAtmosphereBoundaryTexture =
  /*#__PURE__*/ FnLayout({
    typeOnly: true, // BUG: Fails with undefined struct type in WebGL
    name: 'computeTransmittanceToTopAtmosphereBoundaryTexture',
    type: DimensionlessSpectrum,
    inputs: [{ name: 'fragCoord', type: 'vec2' }]
  })(([fragCoord], builder) => {
    const { parameters } = AtmosphereContextBaseNode.get(builder)

    const transmittanceParams = getParamsFromTransmittanceTextureUV(
      fragCoord.div(vec2(parameters.transmittanceTextureSize))
    ).toVar()
    return computeTransmittanceToTopAtmosphereBoundary(
      transmittanceParams.get('radius'),
      transmittanceParams.get('cosView')
    )
  })

const singleScatteringStruct = /*#__PURE__*/ struct(
  {
    rayleigh: DimensionlessSpectrum,
    mie: DimensionlessSpectrum
  },
  'singleScattering'
)

const computeSingleScatteringIntegrand = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeSingleScatteringIntegrand',
  type: singleScatteringStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'rayLength', type: Length },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [
    transmittanceTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    rayLength,
    viewRayIntersectsGround
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { bottomRadius, rayleighDensity, mieDensity } = context

  const radiusEnd = clampRadius(
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
    transmittanceTexture,
    radius,
    cosView,
    rayLength,
    viewRayIntersectsGround
  )
    .mul(getTransmittanceToSun(transmittanceTexture, radiusEnd, cosSunEnd))
    .toVar()

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
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([radius, cosView, viewRayIntersectsGround]) => {
  const result = float().toVar()
  If(viewRayIntersectsGround, () => {
    result.assign(distanceToBottomAtmosphereBoundary(radius, cosView))
  }).Else(() => {
    result.assign(distanceToTopAtmosphereBoundary(radius, cosView))
  })
  return result
})

const computeSingleScattering = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeSingleScattering',
  type: singleScatteringStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [
    transmittanceTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { solarIrradiance, rayleighScattering, mieScattering } = context

  const sampleCount = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(sampleCount)
    .toVar()

  const rayleighSum = vec3(0).toVar()
  const mieSum = vec3(0).toVar()
  Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
    const rayLength = float(i).mul(stepSize).toVar()

    // The Rayleigh and Mie single scattering at the current sample point.
    const deltaRayleighMie = computeSingleScatteringIntegrand(
      transmittanceTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayLength,
      viewRayIntersectsGround
    ).toVar()
    const deltaRayleigh = deltaRayleighMie.get('rayleigh')
    const deltaMie = deltaRayleighMie.get('mie')

    // Sample weight from the trapezoidal rule.
    const weight = select(equal(i, 0).or(equal(i, sampleCount)), 0.5, 1)
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
    cosSun: Dimensionless,
    cosViewSun: Dimensionless,
    viewRayIntersectsGround: 'bool'
  },
  'scatteringParams'
)

const getParamsFromScatteringTextureCoord = /*#__PURE__*/ FnLayout({
  typeOnly: true, // BUG: Fails with the struct return type in WebGL
  name: 'getParamsFromScatteringTextureCoord',
  type: scatteringParamsStruct,
  inputs: [{ name: 'coord', type: 'vec4' }]
})(([coord], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, bottomRadius, topRadius, minCosSun } = context

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toVar()

  // Distance to the horizon.
  const distanceToHorizon = H.mul(
    getUnitRangeFromTextureCoord(
      coord.w,
      parameters.scatteringTextureRadiusSize
    )
  ).toVar()
  const radius = sqrt(distanceToHorizon.pow2().add(bottomRadius.pow2()))

  const cosView = float().toVar()
  const viewRayIntersectsGround = bool().toVar()
  If(coord.z.lessThan(0.5), () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon) - from which we can recover cosView.
    const minDistance = radius.sub(bottomRadius).toVar()
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
    viewRayIntersectsGround.assign(bool(true))
  }).Else(() => {
    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon) - from which we can recover
    // cosView.
    const minDistance = topRadius.sub(radius).toVar()
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
    viewRayIntersectsGround.assign(bool(false))
  })

  const cosSunUnit = getUnitRangeFromTextureCoord(
    coord.y,
    parameters.scatteringTextureCosSunSize
  ).toVar()
  const minDistance = topRadius.sub(bottomRadius).toVar()
  const maxDistance = H
  const D = distanceToTopAtmosphereBoundary(bottomRadius, minCosSun)
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
        .div(mul(2, bottomRadius, distance))
    )
  )
  const cosViewSun = clampCosine(coord.x.mul(2).sub(1))

  return scatteringParamsStruct(
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  )
})

const getParamsFromScatteringTextureFragCoord = /*#__PURE__*/ FnLayout({
  typeOnly: true, // BUG: Fails with the struct return type in WebGL
  name: 'getParamsFromScatteringTextureFragCoord',
  type: scatteringParamsStruct,
  inputs: [{ name: 'fragCoord', type: 'vec3' }]
})(([fragCoord], builder) => {
  const { parameters } = AtmosphereContextBaseNode.get(builder)

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
  )
  const coord = vec4(
    fragCoordCosViewSun,
    fragCoordCosSun,
    fragCoord.y,
    fragCoord.z
  ).div(size)
  const scatteringParams = getParamsFromScatteringTextureCoord(coord).toVar()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosSun = scatteringParams.get('cosSun')
  const cosViewSun = scatteringParams.get('cosViewSun')
  const viewRayIntersectsGround = scatteringParams.get(
    'viewRayIntersectsGround'
  )

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
    viewRayIntersectsGround
  )
})

export const computeSingleScatteringTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeSingleScatteringTexture',
  type: singleScatteringStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'fragCoord', type: 'vec3' }
  ]
})(([transmittanceTexture, fragCoord]) => {
  const scatteringParams =
    getParamsFromScatteringTextureFragCoord(fragCoord).toVar()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosSun = scatteringParams.get('cosSun')
  const cosViewSun = scatteringParams.get('cosViewSun')
  const viewRayIntersectsGround = scatteringParams.get(
    'viewRayIntersectsGround'
  )
  return computeSingleScattering(
    transmittanceTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  )
})

const getScatteringForOrder = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getScatteringForOrder',
  type: RadianceSpectrum,
  inputs: [
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' },
    { name: 'scatteringOrder', type: 'int' }
  ]
})((
  [
    singleRayleighScatteringTexture,
    singleMieScatteringTexture,
    multipleScatteringTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround,
    scatteringOrder
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { miePhaseFunctionG } = context

  const result = vec3().toVar()
  If(scatteringOrder.equal(1), () => {
    const rayleigh = getScattering(
      singleRayleighScatteringTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      viewRayIntersectsGround
    )
    const mie = getScattering(
      singleMieScatteringTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      viewRayIntersectsGround
    )
    result.assign(
      add(
        rayleigh.mul(rayleighPhaseFunction(cosViewSun)),
        mie.mul(miePhaseFunction(miePhaseFunctionG, cosViewSun))
      )
    )
  }).Else(() => {
    result.assign(
      getScattering(
        multipleScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        viewRayIntersectsGround
      )
    )
  })
  return result
})

const computeScatteringDensity = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeScatteringDensity',
  type: RadianceDensitySpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'scatteringOrder', type: 'int' }
  ]
})((
  [
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
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const {
    bottomRadius,
    rayleighDensity,
    rayleighScattering,
    mieDensity,
    mieScattering,
    miePhaseFunctionG
  } = context

  // Compute unit direction vectors for the zenith, the view direction omega
  // and the sun direction omegaSun, such that the cosine of the view-zenith
  // angle is cosView, the cosine of the sun-zenith angle is cosSun, and
  // the cosine of the view-sun angle is cosViewSun. The goal is to simplify
  // computations below.
  const zenithDirection = vec3(0, 0, 1)
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
  const sampleCount = 16
  const deltaPhi = Math.PI / sampleCount
  const deltaTheta = Math.PI / sampleCount
  const radiance = vec3(0).toVar()

  // Nested loops for the integral over all the incident directions omegaI.
  // @ts-expect-error Missing type on custom name
  Loop({ start: 0, end: sampleCount, name: 'l' }, ({ l }) => {
    const theta = float(l).add(0.5).mul(deltaTheta).toVar()
    const cosTheta = cos(theta).toVar()
    const sinTheta = sin(theta).toVar()
    const omegaRayIntersectsGround = rayIntersectsGround(
      radius,
      cosTheta
    ).toVar()

    // The distance and transmittance to the ground only depend on theta, so
    // we can compute them in the outer loop for efficiency.
    const distanceToGround = float(0).toVar()
    const transmittanceToGround = vec3(0).toVar()
    const groundAlbedo = vec3(0).toVar()
    If(omegaRayIntersectsGround, () => {
      distanceToGround.assign(
        distanceToBottomAtmosphereBoundary(radius, cosTheta)
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
      groundAlbedo.assign(context.groundAlbedo)
    })

    // @ts-expect-error Missing type on custom name
    Loop({ start: 0, end: mul(sampleCount, 2), name: 'm' }, ({ m }) => {
      const phi = float(m).add(0.5).mul(deltaPhi).toVar()
      const omegaI = vec3(
        cos(phi).mul(sinTheta),
        sin(phi).mul(sinTheta),
        cosTheta
      ).toVar()
      const deltaOmegaI = sin(theta).mul(deltaTheta).mul(deltaPhi).toVar()

      // The radiance arriving from direction omegaI after n-1 bounces is the
      // sum of a term given by the precomputed scattering texture for the
      // (n-1)-th order:
      const cosViewSun1 = omegaSun.dot(omegaI)
      const incidentRadiance = getScatteringForOrder(
        singleRayleighScatteringTexture,
        singleMieScatteringTexture,
        multipleScatteringTexture,
        radius,
        omegaI.z,
        cosSun,
        cosViewSun1,
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
        transmittanceToGround.mul(groundAlbedo).div(PI).mul(groundIrradiance)
      )

      // The radiance finally scattered from direction omegaI towards
      // direction -omega is the product of the incident radiance, the
      // scattering coefficient, and the phase function for directions omega
      // and omegaI (all this summed over all particle types, i.e. Rayleigh
      // and Mie).
      const cosViewSun2 = omega.dot(omegaI).toVar()
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
              rayleighPhaseFunction(cosViewSun2)
            ),
            mul(
              mieScattering,
              mieDensityValue,
              miePhaseFunction(miePhaseFunctionG, cosViewSun2)
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
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeMultipleScattering',
  type: RadianceSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringDensityTexture', type: ScatteringDensityTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  transmittanceTexture,
  scatteringDensityTexture,
  radius,
  cosView,
  cosSun,
  cosViewSun,
  viewRayIntersectsGround
]) => {
  const sampleCount = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(sampleCount)
    .toVar()

  const radianceSum = vec3(0).toVar()
  Loop({ start: 0, end: sampleCount, condition: '<=' }, ({ i }) => {
    const rayLength = float(i).mul(stepSize).toVar()

    // The radius, cosView and cosSun parameters at the current integration
    // point (see the single scattering section for a detailed explanation).
    const radiusI = clampRadius(
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
    const cosSunI = clampCosine(
      radius.mul(cosSun).add(rayLength.mul(cosViewSun)).div(radiusI)
    )

    // The Rayleigh and Mie multiple scattering at the current sample point.
    const radiance = getScattering(
      scatteringDensityTexture,
      radiusI,
      cosViewI,
      cosSunI,
      cosViewSun,
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
    const weight = select(equal(i, 0).or(equal(i, sampleCount)), 0.5, 1)
    radianceSum.addAssign(radiance.mul(weight))
  })

  return radianceSum
})

export const computeScatteringDensityTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeScatteringDensityTexture',
  type: RadianceDensitySpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'fragCoord', type: 'vec3' },
    { name: 'scatteringOrder', type: 'int' }
  ]
})(([
  transmittanceTexture,
  singleRayleighScatteringTexture,
  singleMieScatteringTexture,
  multipleScatteringTexture,
  irradianceTexture,
  fragCoord,
  scatteringOrder
]) => {
  const scatteringParams =
    getParamsFromScatteringTextureFragCoord(fragCoord).toVar()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosSun = scatteringParams.get('cosSun')
  const cosViewSun = scatteringParams.get('cosViewSun')
  return computeScatteringDensity(
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
})

const multipleScatteringStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    cosViewSun: Dimensionless
  },
  'multipleScattering'
)

export const computeMultipleScatteringTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeMultipleScatteringTexture',
  type: multipleScatteringStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringDensityTexture', type: ScatteringDensityTexture },
    { name: 'fragCoord', type: 'vec3' }
  ]
})(([transmittanceTexture, scatteringDensityTexture, fragCoord]) => {
  const scatteringParams =
    getParamsFromScatteringTextureFragCoord(fragCoord).toVar()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosSun = scatteringParams.get('cosSun')
  const cosViewSun = scatteringParams.get('cosViewSun')
  const viewRayIntersectsGround = scatteringParams.get(
    'viewRayIntersectsGround'
  )
  const radiance = computeMultipleScattering(
    transmittanceTexture,
    scatteringDensityTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  )
  return multipleScatteringStruct(radiance, cosViewSun)
})

const computeDirectIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeDirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosSun', type: Dimensionless }
  ]
})(([transmittanceTexture, radius, cosSun], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { solarIrradiance, sunAngularRadius } = context

  // Approximate average of the cosine factor cosSun over the visible fraction
  // of the Sun disc.
  const alpha = sunAngularRadius
  const averageCosineFactor = select(
    cosSun.lessThan(alpha.negate()),
    0,
    select(
      cosSun.greaterThan(alpha),
      cosSun,
      cosSun.add(alpha).pow2().div(alpha.mul(4))
    )
  )

  return solarIrradiance
    .mul(
      getTransmittanceToTopAtmosphereBoundary(
        transmittanceTexture,
        radius,
        cosSun
      )
    )
    .mul(averageCosineFactor)
})

const computeIndirectIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeIndirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosSun', type: Dimensionless },
    { name: 'scatteringOrder', type: 'int' }
  ]
})(([
  singleRayleighScatteringTexture,
  singleMieScatteringTexture,
  multipleScatteringTexture,
  radius,
  cosSun,
  scatteringOrder
]) => {
  const sampleCount = 32
  const deltaPhi = Math.PI / sampleCount
  const deltaTheta = Math.PI / sampleCount

  const result = vec3(0).toVar()
  const omegaSun = vec3(sqrt(cosSun.pow2().oneMinus()), 0, cosSun).toVar()

  // @ts-expect-error Missing type on custom name
  Loop({ start: 0, end: sampleCount / 2, name: 'j' }, ({ j }) => {
    const theta = float(j).add(0.5).mul(deltaTheta).toVar()

    Loop({ start: 0, end: sampleCount * 2 }, ({ i }) => {
      const phi = float(i).add(0.5).mul(deltaPhi).toVar()
      const omega = vec3(
        cos(phi).mul(sin(theta)),
        sin(phi).mul(sin(theta)),
        cos(theta)
      ).toVar()
      const deltaOmega = sin(theta).mul(deltaTheta * deltaPhi)
      const cosViewSun = omega.dot(omegaSun)
      result.addAssign(
        getScatteringForOrder(
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
})

const irradianceParamsStruct = /*#__PURE__*/ struct(
  {
    radius: Length,
    cosSun: Dimensionless
  },
  'irradianceParams'
)

const getParamsFromIrradianceTextureUV = /*#__PURE__*/ FnLayout({
  typeOnly: true, // BUG: Fails with the struct return type in WebGL
  name: 'getParamsFromIrradianceTextureUV',
  type: irradianceParamsStruct,
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius } = context

  const cosSunUnit = getUnitRangeFromTextureCoord(
    uv.x,
    parameters.irradianceTextureSize.x
  )
  const radiusUnit = getUnitRangeFromTextureCoord(
    uv.y,
    parameters.irradianceTextureSize.y
  )
  const radius = bottomRadius.add(radiusUnit.mul(topRadius.sub(bottomRadius)))
  const cosSun = clampCosine(cosSunUnit.mul(2).sub(1))
  return irradianceParamsStruct(radius, cosSun)
})

export const computeDirectIrradianceTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeDirectIrradianceTexture',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'fragCoord', type: 'vec2' }
  ]
})(([transmittanceTexture, fragCoord], builder) => {
  const { parameters } = AtmosphereContextBaseNode.get(builder)

  const irradianceParams = getParamsFromIrradianceTextureUV(
    fragCoord.div(vec2(parameters.irradianceTextureSize))
  ).toVar()
  const radius = irradianceParams.get('radius')
  const cosSun = irradianceParams.get('cosSun')
  return computeDirectIrradiance(transmittanceTexture, radius, cosSun)
})

export const computeIndirectIrradianceTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'computeIndirectIrradianceTexture',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'singleRayleighScatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'multipleScatteringTexture', type: ScatteringTexture },
    { name: 'fragCoord', type: 'vec2' },
    { name: 'scatteringOrder', type: 'int' }
  ]
})((
  [
    singleRayleighScatteringTexture,
    singleMieScatteringTexture,
    multipleScatteringTexture,
    fragCoord,
    scatteringOrder
  ],
  builder
) => {
  const { parameters } = AtmosphereContextBaseNode.get(builder)

  const irradianceParams = getParamsFromIrradianceTextureUV(
    fragCoord.div(vec2(parameters.irradianceTextureSize))
  ).toVar()
  const radius = irradianceParams.get('radius')
  const cosSun = irradianceParams.get('cosSun')
  return computeIndirectIrradiance(
    singleRayleighScatteringTexture,
    singleMieScatteringTexture,
    multipleScatteringTexture,
    radius,
    cosSun,
    scatteringOrder
  )
})
