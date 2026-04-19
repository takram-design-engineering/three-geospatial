import { add, exp, float, If, Loop, struct, vec3 } from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

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
  Direction,
  IrradianceTexture,
  Length,
  Position,
  RadianceSpectrum,
  ScatteringSpectrum,
  TransmittanceTexture
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
  const otherScattering = 0
  const otherExtinction = absorptionDensity.mul(p.absorptionExtinction)

  const scattering = add(rayleighScattering, mieScattering, otherScattering)
  const extinction = add(rayleighExtinction, mieExtinction, otherExtinction)
  return atmosphereMediumStruct(scattering, extinction)
})

export const singleScatteringIntegralStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    transferFactor: DimensionlessSpectrum,
    opticalDepth: DimensionlessSpectrum,
    transmittance: DimensionlessSpectrum
  },
  'SingleScatteringIntegral'
)

export const integrateSingleScatteringTexture = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'integrateSingleScatteringTexture',
  type: singleScatteringIntegralStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'rayOrigin', type: Position },
    { name: 'rayDirection', type: Direction },
    { name: 'lightDirection', type: Direction },
    { name: 'sampleCount', type: 'int' }
  ]
})(([
  parameters,
  transmittanceTexture,
  irradianceTexture,
  rayOrigin,
  rayDirection,
  lightDirection,
  sampleCount
]) => {
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
  const totalOpticalDepth = vec3(0).toVar()
  const totalTransmittance = vec3(1).toVar()
  const prevRayLength = float(0).toVar()

  Loop({ start: 0, end: sampleCount, condition: '<' }, ({ i }) => {
    const rayLength = distanceToPoint
      .mul(float(i).add(0.3)) // Add a bias the sample point
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
    totalOpticalDepth.addAssign(opticalDepth)

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

  return singleScatteringIntegralStruct(
    totalRadiance,
    transferFactor,
    totalOpticalDepth,
    totalTransmittance
  )
})
