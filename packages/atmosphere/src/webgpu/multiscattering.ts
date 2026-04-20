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

import { add, exp, float, If, Loop, struct, vec3 } from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  atmosphereParametersStruct,
  makeDestructible
} from './AtmosphereContextBase'
import {
  distanceToBottomAtmosphereBoundary,
  distanceToTopAtmosphereBoundary,
  getIrradiance,
  getProfileDensity,
  getTransmittanceToSun,
  rayIntersectsGround
} from './common'
import {
  DimensionlessSpectrum,
  Length,
  RadianceSpectrum,
  ScatteringSpectrum,
  type Direction,
  type IrradianceTexture,
  type Position,
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
  return atmosphereMediumStruct(scattering, extinction)
})

export const singleScatteringIntegralStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    transferFactor: DimensionlessSpectrum
  },
  'SingleScatteringIntegral'
)

export const integrateSingleScatteringTexture = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    rayOrigin: Node<Position>,
    rayDirection: Node<Direction>,
    lightDirection: Node<Direction>,
    sampleCount: Node<'int'>
  ) => {
    const { bottomRadius, groundAlbedo } = makeDestructible(parameters)

    const radius = rayOrigin.length().toConst()
    const cosView = rayOrigin.dot(rayDirection).div(radius).toConst()
    const viewRayIntersectsGround = rayIntersectsGround(
      parameters,
      radius,
      cosView
    ).toConst()
    const distanceToPoint = viewRayIntersectsGround
      .select(
        distanceToBottomAtmosphereBoundary(parameters, radius, cosView),
        distanceToTopAtmosphereBoundary(parameters, radius, cosView)
      )
      .toConst()

    const totalRadiance = vec3(0).toVar()
    const transferFactor = vec3(0).toVar()
    const totalTransmittance = vec3(1).toVar()
    const prevRayLength = float(0).toVar()

    Loop({ start: 0, end: sampleCount, condition: '<' }, ({ i }) => {
      const rayLength = distanceToPoint
        .mul(float(i).add(0.5)) // Add a bias to the sample point
        .div(sampleCount)
        .toConst()

      const stepLength = rayLength.sub(prevRayLength).toConst()
      prevRayLength.assign(rayLength)

      const position = rayLength.mul(rayDirection).add(rayOrigin).toConst()
      const radius = position.length().toConst()

      const altitude = radius.sub(bottomRadius)
      const medium = sampleAtmosphereMedium(parameters, altitude).toConst()
      const scattering = medium.get('scattering')
      const extinction = medium.get('extinction')

      const opticalDepth = extinction.mul(stepLength).toConst()
      const transmittance = exp(opticalDepth.negate()).toConst()

      const cosLight = position.dot(lightDirection).div(radius).toConst()
      const transmittanceToSun = getTransmittanceToSun(
        transmittanceTexture,
        radius,
        cosLight
      ).toConst()

      const multiScatteringIntegrand = scattering
        .sub(scattering.mul(transmittance))
        .div(extinction)
        .toConst()
      transferFactor.addAssign(totalTransmittance.mul(multiScatteringIntegrand))

      const scatteredRadiance = transmittanceToSun
        .mul(scattering.mul(1 / (4 * Math.PI))) // Isotropic phase
        .toConst()
      const scatteringIntegrand = scatteredRadiance
        .sub(scatteredRadiance.mul(transmittance))
        .div(extinction)
        .toConst()
      totalRadiance.addAssign(totalTransmittance.mul(scatteringIntegrand))
      totalTransmittance.mulAssign(transmittance)
    })

    // Account for bounced light off the ground.
    If(viewRayIntersectsGround, () => {
      const groundNormal = rayOrigin
        .add(rayDirection.mul(distanceToPoint))
        .normalize()
        .toConst()
      const groundIrradiance = getIrradiance(
        irradianceTexture,
        bottomRadius,
        groundNormal.dot(lightDirection).toConst()
      )
      totalRadiance.addAssign(
        totalTransmittance
          .mul(groundAlbedo)
          .mul(groundIrradiance)
          .mul(1 / Math.PI)
      )
    })

    return singleScatteringIntegralStruct(totalRadiance, transferFactor)
  }
)
