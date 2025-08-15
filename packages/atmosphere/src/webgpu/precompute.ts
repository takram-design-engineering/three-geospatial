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
  FnLayout,
  Fnv,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type {
  DensityProfileLayerUniforms,
  DensityProfileUniforms
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
import { getAtmosphereContext } from './context'
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

// TODO: Cannot add layouts on any of these functions due to unknown bugs in the
// TSL builder, and there's no way to specify a texture or sampler type.

const getLayerDensity = /*#__PURE__*/ Fnv(
  (
    layer: DensityProfileLayerUniforms,
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
    profile: DensityProfileUniforms,
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
    profile: DensityProfileUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ) =>
    (builder): Node<Length> => {
      const { uniforms } = getAtmosphereContext(builder)

      const SAMPLE_COUNT = 500
      const stepSize = distanceToTopAtmosphereBoundary(radius, cosView)
        .div(SAMPLE_COUNT)
        .toVar()

      const opticalDepth = float(0).toVar()
      Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
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
        const y = getProfileDensity(profile, r.sub(uniforms.bottomRadius))

        // Sample weight from the trapezoidal rule.
        const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
        opticalDepth.addAssign(y.mul(weight).mul(stepSize))
      })

      return opticalDepth
    }
)

const computeTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  typeOnly: true,
  name: 'computeTransmittanceToTopAtmosphereBoundary',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const { parameters, uniforms } = getAtmosphereContext(builder)

  const opticalDepth = add(
    uniforms.rayleighScattering.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        uniforms.rayleighDensity,
        radius,
        cosView
      )
    ),
    uniforms.mieExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        uniforms.mieDensity,
        radius,
        cosView
      )
    ),
    uniforms.absorptionExtinction.mul(
      computeOpticalDepthToTopAtmosphereBoundary(
        uniforms.absorptionDensity,
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
  typeOnly: true,
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
  typeOnly: true,
  name: 'getParamsFromTransmittanceTextureUV',
  type: transmittanceParamsStruct,
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv], builder) => {
  const { parameters, uniforms } = getAtmosphereContext(builder)
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
    uniforms.topRadius.pow2().sub(uniforms.bottomRadius.pow2())
  ).toVar()

  // Distance to the horizon, from which we can compute radius.
  const distanceToHorizon = H.mul(radiusUnit).toVar()
  const radius = sqrt(
    distanceToHorizon.pow2().add(uniforms.bottomRadius.pow2())
  )

  // Distance to the top atmosphere boundary for the ray (radius, cosView),
  // and its minimum and maximum values over all cosView - obtained for
  // (radius, 1) and (radius, cosHorizon) - from which we can recover cosView.
  const minDistance = uniforms.topRadius.sub(radius).toVar()
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
    typeOnly: true,
    name: 'computeTransmittanceToTopAtmosphereBoundaryTexture',
    type: DimensionlessSpectrum,
    inputs: [{ name: 'fragCoord', type: 'vec2' }]
  })(([fragCoord], builder) => {
    const { parameters } = getAtmosphereContext(builder)
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
  typeOnly: true,
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
  const { uniforms } = getAtmosphereContext(builder)

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
    getProfileDensity(
      uniforms.rayleighDensity,
      radiusEnd.sub(uniforms.bottomRadius)
    )
  )
  const mie = transmittance.mul(
    getProfileDensity(uniforms.mieDensity, radiusEnd.sub(uniforms.bottomRadius))
  )
  return singleScatteringStruct(rayleigh, mie)
})

const distanceToNearestAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  typeOnly: true,
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
  typeOnly: true,
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
  const { uniforms } = getAtmosphereContext(builder)

  const SAMPLE_COUNT = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(SAMPLE_COUNT)
    .toVar()

  const rayleighSum = vec3(0).toVar()
  const mieSum = vec3(0).toVar()
  Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
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
    const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
    rayleighSum.addAssign(deltaRayleigh.mul(weight))
    mieSum.addAssign(deltaMie.mul(weight))
  })

  const rayleigh = mul(
    rayleighSum,
    stepSize,
    uniforms.solarIrradiance,
    uniforms.rayleighScattering
  )
  const mie = mul(
    mieSum,
    stepSize,
    uniforms.solarIrradiance,
    uniforms.mieScattering
  )
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
  typeOnly: true,
  name: 'getParamsFromScatteringTextureCoord',
  type: scatteringParamsStruct,
  inputs: [{ name: 'coord', type: 'vec4' }]
})(([coord], builder) => {
  const { parameters, uniforms } = getAtmosphereContext(builder)

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(
    uniforms.topRadius.pow2().sub(uniforms.bottomRadius.pow2())
  ).toVar()

  // Distance to the horizon.
  const distanceToHorizon = H.mul(
    getUnitRangeFromTextureCoord(
      coord.w,
      parameters.scatteringTextureRadiusSize
    )
  ).toVar()
  const radius = sqrt(
    distanceToHorizon.pow2().add(uniforms.bottomRadius.pow2())
  )

  const cosView = float().toVar()
  const viewRayIntersectsGround = bool().toVar()
  If(coord.z.lessThan(0.5), () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon) - from which we can recover cosView.
    const minDistance = radius.sub(uniforms.bottomRadius).toVar()
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
    const minDistance = uniforms.topRadius.sub(radius).toVar()
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
  const minDistance = uniforms.topRadius.sub(uniforms.bottomRadius).toVar()
  const maxDistance = H
  const D = distanceToTopAtmosphereBoundary(
    uniforms.bottomRadius,
    uniforms.minCosSun
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
        .div(mul(2, uniforms.bottomRadius, distance))
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
  typeOnly: true,
  name: 'getParamsFromScatteringTextureFragCoord',
  type: scatteringParamsStruct,
  inputs: [{ name: 'fragCoord', type: 'vec3' }]
})(([fragCoord], builder) => {
  const { parameters } = getAtmosphereContext(builder)

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
  typeOnly: true,
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
  typeOnly: true,
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
  const { uniforms } = getAtmosphereContext(builder)

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
        mie.mul(miePhaseFunction(uniforms.miePhaseFunctionG, cosViewSun))
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
  typeOnly: true,
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
  const { uniforms } = getAtmosphereContext(builder)

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
  // @ts-expect-error Missing type
  Loop({ start: 0, end: SAMPLE_COUNT, name: 'l' }, ({ l }) => {
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
      groundAlbedo.assign(uniforms.groundAlbedo)
    })

    // @ts-expect-error Missing type
    Loop({ start: 0, end: mul(SAMPLE_COUNT, 2), name: 'm' }, ({ m }) => {
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
        uniforms.bottomRadius,
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
        uniforms.rayleighDensity,
        radius.sub(uniforms.bottomRadius)
      )
      const mieDensity = getProfileDensity(
        uniforms.mieDensity,
        radius.sub(uniforms.bottomRadius)
      )
      radiance.addAssign(
        incidentRadiance.mul(
          add(
            mul(
              uniforms.rayleighScattering,
              rayleighDensity,
              rayleighPhaseFunction(cosViewSun2)
            ),
            mul(
              uniforms.mieScattering,
              mieDensity,
              miePhaseFunction(uniforms.miePhaseFunctionG, cosViewSun2)
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
  typeOnly: true,
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
  const SAMPLE_COUNT = 50
  const stepSize = distanceToNearestAtmosphereBoundary(
    radius,
    cosView,
    viewRayIntersectsGround
  )
    .div(SAMPLE_COUNT)
    .toVar()

  const radianceSum = vec3(0).toVar()
  Loop({ start: 0, end: SAMPLE_COUNT, condition: '<=' }, ({ i }) => {
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
    const weight = select(equal(i, 0).or(equal(i, SAMPLE_COUNT)), 0.5, 1)
    radianceSum.addAssign(radiance.mul(weight))
  })

  return radianceSum
})

export const computeScatteringDensityTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true,
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
  typeOnly: true,
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
  typeOnly: true,
  name: 'computeDirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosSun', type: Dimensionless }
  ]
})(([transmittanceTexture, radius, cosSun], builder) => {
  const { uniforms } = getAtmosphereContext(builder)
  const alpha = uniforms.sunAngularRadius

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

  return uniforms.solarIrradiance
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
  typeOnly: true,
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
  const SAMPLE_COUNT = 32
  const deltaPhi = PI.div(SAMPLE_COUNT).toConst()
  const deltaTheta = PI.div(SAMPLE_COUNT).toConst()

  const result = vec3(0).toVar()
  const omegaSun = vec3(sqrt(cosSun.pow2().oneMinus()), 0, cosSun).toVar()

  // @ts-expect-error Missing type
  Loop({ start: 0, end: SAMPLE_COUNT / 2, name: 'j' }, ({ j }) => {
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
  typeOnly: true,
  name: 'getParamsFromIrradianceTextureUV',
  type: irradianceParamsStruct,
  inputs: [{ name: 'uv', type: 'vec2' }]
})(([uv], builder) => {
  const { parameters, uniforms } = getAtmosphereContext(builder)
  const cosSunUnit = getUnitRangeFromTextureCoord(
    uv.x,
    parameters.irradianceTextureSize.x
  )
  const radiusUnit = getUnitRangeFromTextureCoord(
    uv.y,
    parameters.irradianceTextureSize.y
  )
  const radius = uniforms.bottomRadius.add(
    radiusUnit.mul(uniforms.topRadius.sub(uniforms.bottomRadius))
  )
  const cosSun = clampCosine(cosSunUnit.mul(2).sub(1))
  return irradianceParamsStruct(radius, cosSun)
})

export const computeDirectIrradianceTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true,
  name: 'computeDirectIrradianceTexture',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'fragCoord', type: 'vec2' }
  ]
})(([transmittanceTexture, fragCoord], builder) => {
  const { parameters } = getAtmosphereContext(builder)
  const irradianceParams = getParamsFromIrradianceTextureUV(
    fragCoord.div(vec2(parameters.irradianceTextureSize))
  ).toVar()
  const radius = irradianceParams.get('radius')
  const cosSun = irradianceParams.get('cosSun')
  return computeDirectIrradiance(transmittanceTexture, radius, cosSun)
})

export const computeIndirectIrradianceTexture = /*#__PURE__*/ FnLayout({
  typeOnly: true,
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
  const { parameters } = getAtmosphereContext(builder)
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
