// Based on: https://github.com/sebh/UnrealEngineSkyAtmosphere/blob/master/Resources/RenderSkyRayMarching.hlsl

/**
 * MIT License
 *
 * Copyright (c) 2020 Epic Games, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {
  add,
  exp,
  float,
  If,
  Loop,
  mix,
  mul,
  sqrt,
  step,
  struct,
  vec2,
  vec3
} from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import {
  FnLayout,
  FnVar,
  stbn,
  type Node
} from '@takram/three-geospatial/webgpu'

import {
  atmosphereParametersStruct,
  getAtmosphereContextBase,
  makeDestructible
} from './AtmosphereContextBase'
import {
  clampCosine,
  clampRadius,
  distanceToNearestAtmosphereBoundary,
  getIrradiance,
  getParamsFromScatteringTextureFragCoord,
  getProfileDensity,
  getTransmittanceToSun,
  miePhaseFunction,
  rayIntersectsGround,
  rayleighPhaseFunction
} from './common'
import {
  AbstractSpectrum,
  DimensionlessSpectrum,
  IrradianceSpectrum,
  Length,
  RadianceSpectrum,
  ScatteringSpectrum,
  type Dimensionless,
  type HighOrderScatteringTexture,
  type IrradianceTexture,
  type TransmittanceTexture
} from './dimensional'

export const getSubUVFromTextureUnit = /*#__PURE__*/ FnLayout({
  name: 'getSubUVFromTextureUnit',
  type: 'vec2',
  inputs: [
    { name: 'unit', type: 'vec2' },
    { name: 'textureSize', type: 'vec2' }
  ]
})(([unit, textureSize]) => {
  return unit
    .add(float(0.5).div(textureSize))
    .mul(textureSize.div(textureSize.add(1)))
})

export const getTextureUnitFromSubUV = /*#__PURE__*/ FnLayout({
  name: 'getTextureUnitFromSubUV',
  type: 'vec2',
  inputs: [
    { name: 'subUV', type: 'vec2' },
    { name: 'textureSize', type: 'vec2' }
  ]
})(([subUV, textureSize]) => {
  return subUV
    .sub(float(0.5).div(textureSize))
    .mul(textureSize.div(textureSize.sub(1)))
})

export const atmosphereMediumStruct = /*#__PURE__*/ struct(
  {
    rayleighScattering: ScatteringSpectrum,
    mieScattering: ScatteringSpectrum,
    scattering: ScatteringSpectrum,
    extinction: ScatteringSpectrum
  },
  'AtmosphereMedium'
)

export const sampleAtmosphereMedium = /*#__PURE__*/ FnLayout({
  name: 'sampleAtmosphereMedium',
  type: atmosphereMediumStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'altitude', type: Length }
  ]
})(([parameters, altitude]) => {
  const p = makeDestructible(parameters)
  const rayleighDensity = getProfileDensity(p.rayleighDensity, altitude)
  const mieDensity = getProfileDensity(p.mieDensity, altitude)
  const absorptionDensity = getProfileDensity(p.absorptionDensity, altitude)

  const rayleighScattering = rayleighDensity.mul(p.rayleighScattering)
  const rayleighExtinction = rayleighScattering
  const mieScattering = mieDensity.mul(p.mieScattering)
  const mieExtinction = mieDensity.mul(p.mieExtinction)
  const otherExtinction = absorptionDensity.mul(p.absorptionExtinction)

  const scattering = add(rayleighScattering, mieScattering)
  const extinction = add(rayleighExtinction, mieExtinction, otherExtinction)
  return atmosphereMediumStruct(
    rayleighScattering,
    mieScattering,
    scattering,
    extinction
  )
})

export const multipleScatteringStruct = /*#__PURE__*/ struct(
  {
    multipleScattering: RadianceSpectrum,
    transferFactor: DimensionlessSpectrum
  },
  'MultipleScattering'
)

export const computeMultipleScatteringTexture = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>
  ): ReturnType<typeof multipleScatteringStruct> => {
    const { bottomRadius, groundAlbedo } = makeDestructible(parameters)

    const intersectsGround = rayIntersectsGround(
      parameters,
      radius,
      cosView
    ).toConst()
    const distanceToPoint = distanceToNearestAtmosphereBoundary(
      parameters,
      radius,
      cosView,
      intersectsGround
    ).toConst()

    const totalMultipleScattering = vec3(0).toVar()
    const totalTransferFactor = vec3(0).toVar()
    const totalTransmittance = vec3(1).toVar()
    const prevRayLength = float(0).toVar()

    const sampleCount = 20
    Loop({ type: 'float', start: 0, end: sampleCount }, ({ i }) => {
      const rayLength = distanceToPoint
        .mul(i.add(0.3)) // Add a bias to the sample point
        .div(sampleCount)
        .toConst()

      const stepSize = rayLength.sub(prevRayLength).toConst()
      prevRayLength.assign(rayLength)

      const radiusI = clampRadius(
        parameters,
        sqrt(
          rayLength
            .pow2()
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.pow2())
        )
      ).toConst()

      const cosLightI = clampCosine(
        radius.mul(cosLight).add(rayLength.mul(cosViewLight)).div(radiusI)
      ).toConst()

      const altitude = radiusI.sub(bottomRadius)
      const medium = sampleAtmosphereMedium(parameters, altitude).toConst()
      const scattering = medium.get('scattering')
      const extinction = medium.get('extinction')

      const opticalDepth = extinction.mul(stepSize).toConst()
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceTexture,
        radiusI,
        cosLightI
      ).toConst()

      const transferFactor = scattering
        .sub(scattering.mul(transmittance))
        .div(extinction)
        .toConst()
      totalTransferFactor.addAssign(totalTransmittance.mul(transferFactor))

      const multipleScattering = transmittanceToSun
        .mul(scattering.mul(1 / (4 * Math.PI))) // Isotropic phase
        .toConst()
      const multipleScatteringIntegrand = multipleScattering
        .sub(multipleScattering.mul(transmittance))
        .div(extinction)
        .toConst()
      totalMultipleScattering.addAssign(
        totalTransmittance.mul(multipleScatteringIntegrand)
      )
      totalTransmittance.mulAssign(transmittance)
    })

    // TODO:
    // Account for bounced light off the ground.
    If(intersectsGround, () => {
      const cosLightAtGround = clampCosine(
        radius
          .mul(cosLight)
          .add(distanceToPoint.mul(cosViewLight))
          .div(bottomRadius)
      ).toConst()
      const groundIrradiance = getIrradiance(
        irradianceTexture,
        bottomRadius,
        cosLightAtGround
      )
      totalMultipleScattering.addAssign(
        totalTransmittance
          .mul(groundAlbedo)
          .mul(groundIrradiance)
          .mul(1 / Math.PI)
      )
    })

    return multipleScatteringStruct(
      totalMultipleScattering,
      totalTransferFactor
    )
  }
)

export const getMultipleScattering = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    multipleScatteringTexture: HighOrderScatteringTexture,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ): Node<'vec3'> => {
    const { topRadius, bottomRadius, multipleScatteringTextureSize } =
      makeDestructible(parameters)
    const uv = getSubUVFromTextureUnit(
      vec2(
        cosLight.mul(0.5).add(0.5),
        radius.sub(bottomRadius).div(topRadius.sub(bottomRadius))
      ).saturate(),
      multipleScatteringTextureSize
    )
    return multipleScatteringTexture.sample(uv).rgb
  }
)

export const scatteringToPointStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    transmittance: DimensionlessSpectrum
  },
  'ScatteringToPoint'
)

// TODO: Move to the context or parameters
const minSampleCount = 4
const maxSampleCount = 14

export const computeScatteringToPoint = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    transmittanceTexture: TextureNode,
    multipleScatteringTexture: TextureNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    maxDistance: Node<Length>,
    shadowLength: Node<Length>
  ): ReturnType<typeof scatteringToPointStruct> => {
    const { solarIrradiance, bottomRadius, miePhaseFunctionG } =
      makeDestructible(parameters)

    // Setup a variable sample count.
    const sampleCount = mix(
      minSampleCount,
      maxSampleCount,
      maxDistance.mul(1 / 100)
    ).toConst()
    const sampleCountFloor = sampleCount.floor().toConst()
    const sampleCountFloorInv = sampleCountFloor.reciprocal().toConst()
    // Rescale distanceToPoint to map to the last entire step segment.
    const maxDistanceFloor = maxDistance
      .mul(sampleCountFloor)
      .div(sampleCount)
      .toConst()

    const miePhase = miePhaseFunction(miePhaseFunctionG, cosViewLight).toConst()
    const rayleighPhase = rayleighPhaseFunction(cosViewLight).toConst()

    const totalRadiance = vec3(0).toVar()
    const totalTransmittance = vec3(1).toVar()

    Loop({ type: 'float', start: 0, end: sampleCount }, ({ i }) => {
      const t0 = i.mul(sampleCountFloorInv).toVar()
      const t1 = i.add(1).mul(sampleCountFloorInv).toVar()
      // Non linear distribution of sample within the range.
      t0.mulAssign(t0)
      t1.mulAssign(t1)
      // Make t0 and t1 world space distances.
      t0.mulAssign(maxDistanceFloor)
      t1.assign(t1.greaterThan(1).select(maxDistance, maxDistanceFloor.mul(t1)))

      const stepSize = t1.sub(t0)
      const rayLength = t0.add(stepSize.mul(stbn)) // Add a bias to the sample point

      const radiusI = clampRadius(
        parameters,
        sqrt(
          rayLength
            .pow2()
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.pow2())
        )
      ).toConst()

      const cosLightI = clampCosine(
        radius.mul(cosLight).add(rayLength.mul(cosViewLight)).div(radiusI)
      ).toConst()

      const altitude = radiusI.sub(bottomRadius)
      const medium = sampleAtmosphereMedium(parameters, altitude).toConst()
      const rayleighScattering = medium.get('rayleighScattering')
      const mieScattering = medium.get('mieScattering')
      const scattering = medium.get('scattering')
      const extinction = medium.get('extinction')

      const opticalDepth = extinction.mul(stepSize)
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceTexture,
        radiusI,
        cosLightI
      ).toConst()

      const multipleScattering = getMultipleScattering(
        parameters,
        multipleScatteringTexture,
        radiusI,
        cosLightI
      )
        .mul(scattering)
        .toConst()

      const shadow = step(shadowLength, rayLength)

      const singleScattering = add(
        rayleighScattering.mul(rayleighPhase),
        mieScattering.mul(miePhase)
      )
      const radiance = solarIrradiance
        .mul(
          transmittanceToSun
            .mul(singleScattering)
            .mul(shadow)
            .add(multipleScattering)
        )
        .toConst()
      const radianceIntegrand = radiance
        .sub(radiance.mul(transmittance))
        .div(extinction)
        .toConst()
      totalRadiance.addAssign(totalTransmittance.mul(radianceIntegrand))
      totalTransmittance.mulAssign(transmittance)
    })

    return scatteringToPointStruct(totalRadiance, totalTransmittance)
  }
)

const splitScatteringStruct = /*#__PURE__*/ struct(
  {
    scattering: IrradianceSpectrum,
    singleMieScattering: IrradianceSpectrum,
    higherOrderScattering: AbstractSpectrum
  },
  'SplitScattering'
)

const computeSplitScattering = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    transmittanceTexture: TextureNode,
    multipleScatteringTexture: TextureNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    intersectsGround: Node<'bool'>
  ): ReturnType<typeof splitScatteringStruct> => {
    const { solarIrradiance, bottomRadius } = makeDestructible(parameters)

    const maxDistance = distanceToNearestAtmosphereBoundary(
      parameters,
      radius,
      cosView,
      intersectsGround
    ).toConst()

    // Setup a variable sample count.
    const sampleCount = mix(
      minSampleCount,
      maxSampleCount,
      maxDistance.mul(1 / 100)
    ).toConst()
    const sampleCountFloor = sampleCount.floor().toConst()
    const sampleCountFloorInv = sampleCountFloor.reciprocal().toConst()
    // Rescale distanceToPoint to map to the last entire step segment.
    const maxDistanceFloor = maxDistance
      .mul(sampleCountFloor)
      .div(sampleCount)
      .toConst()

    const rayleighPhase = rayleighPhaseFunction(cosViewLight).toConst()

    const totalRayleigh = vec3(0).toVar()
    const totalMie = vec3(0).toVar()
    const totalHigherOrder = vec3(0).toVar()
    const totalTransmittance = vec3(1).toVar()

    Loop({ type: 'float', start: 0, end: sampleCount }, ({ i }) => {
      const t0 = i.mul(sampleCountFloorInv).toVar()
      const t1 = i.add(1).mul(sampleCountFloorInv).toVar()
      // Non linear distribution of sample within the range.
      t0.mulAssign(t0)
      t1.mulAssign(t1)
      // Make t0 and t1 world space distances.
      t0.mulAssign(maxDistanceFloor)
      t1.assign(t1.greaterThan(1).select(maxDistance, maxDistanceFloor.mul(t1)))

      const stepSize = t1.sub(t0)
      const rayLength = t0.add(stepSize.mul(0.3)) // Add a bias to the sample point

      const radiusI = clampRadius(
        parameters,
        sqrt(
          rayLength
            .pow2()
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.pow2())
        )
      ).toConst()

      const cosLightI = clampCosine(
        radius.mul(cosLight).add(rayLength.mul(cosViewLight)).div(radiusI)
      ).toConst()

      const altitude = radiusI.sub(bottomRadius)
      const medium = sampleAtmosphereMedium(parameters, altitude).toConst()
      const rayleighScattering = medium.get('rayleighScattering')
      const mieScattering = medium.get('mieScattering')
      const scattering = medium.get('scattering')
      const extinction = medium.get('extinction')

      const opticalDepth = extinction.mul(stepSize)
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceTexture,
        radiusI,
        cosLightI
      ).toConst()

      const multipleScattering = getMultipleScattering(
        parameters,
        multipleScatteringTexture,
        radiusI,
        cosLightI
      )
        .mul(scattering)
        .toConst()

      // Integrate the Rayleigh scattering and multiple scattering over the
      // Rayleigh phase (irradiance), in the way it matches to the Bruneton's
      // 4D scattering LUT.
      const rayleigh = solarIrradiance
        .mul(
          transmittanceToSun
            .mul(rayleighScattering)
            .add(multipleScattering.div(rayleighPhase))
        )
        .toConst()
      const rayleighIntegrand = rayleigh
        .sub(rayleigh.mul(transmittance))
        .div(extinction)
        .toConst()
      totalRayleigh.addAssign(totalTransmittance.mul(rayleighIntegrand))

      // Integrate the Mie scattering over the Mie phase (irradiance).
      const mie = solarIrradiance
        .mul(transmittanceToSun.mul(mieScattering))
        .toConst()
      const mieIntegrand = mie
        .sub(mie.mul(transmittance))
        .div(extinction)
        .toConst()
      totalMie.addAssign(totalTransmittance.mul(mieIntegrand))

      // Integrate the higher-order scattering radiance.
      const higherOrder = solarIrradiance.mul(multipleScattering)
      const higherOrderIntegrand = higherOrder
        .sub(higherOrder.mul(transmittance))
        .div(extinction)
        .toConst()
      totalHigherOrder.addAssign(totalTransmittance.mul(higherOrderIntegrand))

      totalTransmittance.mulAssign(transmittance)
    })

    return splitScatteringStruct(totalRayleigh, totalMie, totalHigherOrder)
  }
)

export const computeSplitScatteringTexture = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TextureNode,
    multipleTexture: TextureNode,
    fragCoord: Node<'vec3'>
  ) =>
    (builder): ReturnType<typeof computeSplitScattering> => {
      const context = getAtmosphereContextBase(builder)

      const scatteringParams = getParamsFromScatteringTextureFragCoord(
        context.parametersNode,
        fragCoord
      ).toConst()
      const radius = scatteringParams.get('radius')
      const cosView = scatteringParams.get('cosView')
      const cosLight = scatteringParams.get('cosLight')
      const cosViewLight = scatteringParams.get('cosViewLight')
      const intersectsGround = scatteringParams.get('intersectsGround')
      return computeSplitScattering(
        context.parametersNode,
        transmittanceTexture,
        multipleTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        intersectsGround
      )
    }
)
