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

import type { AtmosphereContext } from './AtmosphereContext'
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
  radianceTransferStruct,
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
  type Dimensionless
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
    transmittanceNode: TextureNode,
    irradianceNode: TextureNode,
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
      const mediumScattering = medium.get('scattering')
      const mediumExtinction = medium.get('extinction')

      const opticalDepth = mediumExtinction.mul(stepSize).toConst()
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceNode,
        radiusI,
        cosLightI
      ).toConst()

      const transferFactor = mediumScattering
        .sub(mediumScattering.mul(transmittance))
        .div(mediumExtinction)
        .toConst()
      totalTransferFactor.addAssign(totalTransmittance.mul(transferFactor))

      const multipleScattering = transmittanceToSun
        .mul(mediumScattering.mul(1 / (4 * Math.PI))) // Isotropic phase
        .toConst()
      const multipleScatteringIntegrand = multipleScattering
        .sub(multipleScattering.mul(transmittance))
        .div(mediumExtinction)
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
        irradianceNode,
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

const getMultipleScattering = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    multipleScatteringNode: TextureNode,
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
    return multipleScatteringNode.sample(uv).rgb
  }
)

const scatteringStruct = /*#__PURE__*/ struct(
  {
    scattering: IrradianceSpectrum,
    singleMieScattering: IrradianceSpectrum,
    higherOrderScattering: AbstractSpectrum
  },
  'Scattering'
)

const computeScattering = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    transmittanceNode: TextureNode,
    multipleScatteringNode: TextureNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    intersectsGround: Node<'bool'>
  ): ReturnType<typeof scatteringStruct> => {
    const { solarIrradiance, bottomRadius } = makeDestructible(parameters)

    const maxDistance = distanceToNearestAtmosphereBoundary(
      parameters,
      radius,
      cosView,
      intersectsGround
    ).toConst()

    // Setup a variable sample count.
    const minSampleCount = 14
    const maxSampleCount = 30
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

    const totalScattering = vec3(0).toVar()
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
      const mediumScattering = medium.get('scattering')
      const mediumExtinction = medium.get('extinction')

      const opticalDepth = mediumExtinction.mul(stepSize)
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceNode,
        radiusI,
        cosLightI
      ).toConst()

      const multipleScattering = getMultipleScattering(
        parameters,
        multipleScatteringNode,
        radiusI,
        cosLightI
      )
        .mul(mediumScattering)
        .toConst()

      // Integrate the Rayleigh scattering and multiple scattering over the
      // Rayleigh phase (irradiance), in the way it matches to the Bruneton's
      // 4D scattering LUT.
      const scattering = solarIrradiance
        .mul(
          transmittanceToSun
            .mul(rayleighScattering)
            .add(multipleScattering.div(rayleighPhase))
        )
        .toConst()
      const scatteringIntegrand = scattering
        .sub(scattering.mul(transmittance))
        .div(mediumExtinction)
        .toConst()
      totalScattering.addAssign(totalTransmittance.mul(scatteringIntegrand))

      // Integrate the Mie scattering over the Mie phase (irradiance).
      const mie = solarIrradiance
        .mul(transmittanceToSun.mul(mieScattering))
        .toConst()
      const mieIntegrand = mie
        .sub(mie.mul(transmittance))
        .div(mediumExtinction)
        .toConst()
      totalMie.addAssign(totalTransmittance.mul(mieIntegrand))

      // Integrate the higher-order scattering radiance.
      const higherOrder = solarIrradiance.mul(multipleScattering)
      const higherOrderIntegrand = higherOrder
        .sub(higherOrder.mul(transmittance))
        .div(mediumExtinction)
        .toConst()
      totalHigherOrder.addAssign(totalTransmittance.mul(higherOrderIntegrand))

      totalTransmittance.mulAssign(transmittance)
    })

    return scatteringStruct(totalScattering, totalMie, totalHigherOrder)
  }
)

export const computeScatteringTexture = /*#__PURE__*/ FnVar(
  (
    transmittanceNode: TextureNode,
    multipleScatteringNode: TextureNode,
    fragCoord: Node<'vec3'>
  ) =>
    (builder): ReturnType<typeof computeScattering> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context

      const scatteringParams = getParamsFromScatteringTextureFragCoord(
        parametersNode,
        fragCoord
      ).toConst()
      const radius = scatteringParams.get('radius')
      const cosView = scatteringParams.get('cosView')
      const cosLight = scatteringParams.get('cosLight')
      const cosViewLight = scatteringParams.get('cosViewLight')
      const intersectsGround = scatteringParams.get('intersectsGround')
      return computeScattering(
        parametersNode,
        transmittanceNode,
        multipleScatteringNode,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        intersectsGround
      )
    }
)

export const computeIndirectRadianceToPoint = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    maxDistance: Node<Length>,
    shadowLength: Node<Length>
  ): ReturnType<typeof radianceTransferStruct> => {
    const { lutNode, parametersNode, scatteringSampleCount } = context
    const transmittanceNode = lutNode.getTextureNode('transmittance')
    const multipleScatteringNode = lutNode.getTextureNode('multipleScattering')

    const { solarIrradiance, bottomRadius, miePhaseFunctionG } = parametersNode

    // Setup a variable sample count.
    const sampleCount = mix(
      scatteringSampleCount.x,
      scatteringSampleCount.y,
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
    const litDistance = maxDistance.sub(shadowLength).toConst()

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
        parametersNode,
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
      const medium = sampleAtmosphereMedium(parametersNode, altitude).toConst()
      const rayleighScattering = medium.get('rayleighScattering')
      const mieScattering = medium.get('mieScattering')
      const mediumScattering = medium.get('scattering')
      const mediumExtinction = medium.get('extinction')

      const opticalDepth = mediumExtinction.mul(stepSize)
      const transmittance = exp(opticalDepth.negate()).toConst()

      const transmittanceToSun = getTransmittanceToSun(
        transmittanceNode,
        radiusI,
        cosLightI
      ).toConst()

      const multipleScattering = getMultipleScattering(
        parametersNode,
        multipleScatteringNode,
        radiusI,
        cosLightI
      )
        .mul(mediumScattering)
        .toConst()

      const shadow = step(rayLength, litDistance)

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
        .div(mediumExtinction)
        .toConst()
      totalRadiance.addAssign(totalTransmittance.mul(radianceIntegrand))
      totalTransmittance.mulAssign(transmittance)
    })

    return radianceTransferStruct(totalRadiance, totalTransmittance)
  }
)
