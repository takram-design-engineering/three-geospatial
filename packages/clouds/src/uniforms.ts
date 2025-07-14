import {
  Uniform,
  Vector3,
  Vector4,
  type Data3DTexture,
  type Matrix4,
  type Texture,
  type Vector2
} from 'three'
import invariant from 'tiny-invariant'
import type { Primitive } from 'type-fest'

import type { AtmosphereParameters } from '@takram/three-atmosphere'

import type { CloudLayers } from './CloudLayers'

export interface CloudParameterUniforms {
  // Participating medium
  scatteringCoefficient: Uniform<number>
  absorptionCoefficient: Uniform<number>

  // Weather and shape
  coverage: Uniform<number>
  localWeatherTexture: Uniform<Texture | null>
  localWeatherRepeat: Uniform<Vector2>
  localWeatherOffset: Uniform<Vector2>
  shapeTexture: Uniform<Data3DTexture | null>
  shapeRepeat: Uniform<Vector3>
  shapeOffset: Uniform<Vector3>
  shapeDetailTexture: Uniform<Data3DTexture | null>
  shapeDetailRepeat: Uniform<Vector3>
  shapeDetailOffset: Uniform<Vector3>
  turbulenceTexture: Uniform<Texture | null>
  turbulenceRepeat: Uniform<Vector2>
  turbulenceDisplacement: Uniform<number>
}

// prettier-ignore
export type CloudParameterUniformInstances = {
  [K in keyof CloudParameterUniforms as
    CloudParameterUniforms[K]['value'] extends Primitive ? never : K
  ]: CloudParameterUniforms[K]['value']
}

export function createCloudParameterUniforms(
  instances: CloudParameterUniformInstances
): CloudParameterUniforms {
  return {
    // Participating medium
    scatteringCoefficient: new Uniform(1),
    absorptionCoefficient: new Uniform(0),

    // Weather and shape
    coverage: new Uniform(0.3),
    localWeatherTexture: new Uniform(instances.localWeatherTexture),
    localWeatherRepeat: new Uniform(instances.localWeatherRepeat),
    localWeatherOffset: new Uniform(instances.localWeatherOffset),
    shapeTexture: new Uniform(instances.shapeTexture),
    shapeRepeat: new Uniform(instances.shapeRepeat),
    shapeOffset: new Uniform(instances.shapeOffset),
    shapeDetailTexture: new Uniform(instances.shapeDetailTexture),
    shapeDetailRepeat: new Uniform(instances.shapeDetailRepeat),
    shapeDetailOffset: new Uniform(instances.shapeDetailOffset),
    turbulenceTexture: new Uniform(instances.turbulenceTexture),
    turbulenceRepeat: new Uniform(instances.turbulenceRepeat),
    turbulenceDisplacement: new Uniform(350)
  }
}

interface DensityProfileVectors {
  expTerms: Vector4
  exponents: Vector4
  linearTerms: Vector4
  constantTerms: Vector4
}

export interface CloudLayerUniforms {
  minLayerHeights: Uniform<Vector4>
  maxLayerHeights: Uniform<Vector4>
  minIntervalHeights: Uniform<Vector3>
  maxIntervalHeights: Uniform<Vector3>
  densityScales: Uniform<Vector4>
  shapeAmounts: Uniform<Vector4>
  shapeDetailAmounts: Uniform<Vector4>
  weatherExponents: Uniform<Vector4>
  shapeAlteringBiases: Uniform<Vector4>
  coverageFilterWidths: Uniform<Vector4>
  minHeight: Uniform<number>
  maxHeight: Uniform<number>
  shadowTopHeight: Uniform<number>
  shadowBottomHeight: Uniform<number>
  shadowLayerMask: Uniform<Vector4>
  densityProfile: Uniform<DensityProfileVectors>
}

export function createCloudLayerUniforms(): CloudLayerUniforms {
  return {
    minLayerHeights: new Uniform(new Vector4()),
    maxLayerHeights: new Uniform(new Vector4()),
    minIntervalHeights: new Uniform(new Vector3()),
    maxIntervalHeights: new Uniform(new Vector3()),
    densityScales: new Uniform(new Vector4()),
    shapeAmounts: new Uniform(new Vector4()),
    shapeDetailAmounts: new Uniform(new Vector4()),
    weatherExponents: new Uniform(new Vector4()),
    shapeAlteringBiases: new Uniform(new Vector4()),
    coverageFilterWidths: new Uniform(new Vector4()),
    minHeight: new Uniform(0),
    maxHeight: new Uniform(0),
    shadowTopHeight: new Uniform(0),
    shadowBottomHeight: new Uniform(0),
    shadowLayerMask: new Uniform(new Vector4()),
    densityProfile: new Uniform({
      expTerms: new Vector4(),
      exponents: new Vector4(),
      linearTerms: new Vector4(),
      constantTerms: new Vector4()
    })
  }
}

const shadowLayerMask = [0, 0, 0, 0]

export function updateCloudLayerUniforms(
  uniforms: CloudLayerUniforms,
  layers: CloudLayers
): void {
  layers.packValues('altitude', uniforms.minLayerHeights.value)
  layers.packSums('altitude', 'height', uniforms.maxLayerHeights.value)
  layers.packIntervalHeights(
    uniforms.minIntervalHeights.value,
    uniforms.maxIntervalHeights.value
  )
  layers.packValues('densityScale', uniforms.densityScales.value)
  layers.packValues('shapeAmount', uniforms.shapeAmounts.value)
  layers.packValues('shapeDetailAmount', uniforms.shapeDetailAmounts.value)
  layers.packValues('weatherExponent', uniforms.weatherExponents.value)
  layers.packValues('shapeAlteringBias', uniforms.shapeAlteringBiases.value)
  layers.packValues('coverageFilterWidth', uniforms.coverageFilterWidths.value)

  const densityProfile = uniforms.densityProfile.value
  layers.packDensityProfiles('expTerm', densityProfile.expTerms)
  layers.packDensityProfiles('exponent', densityProfile.exponents)
  layers.packDensityProfiles('linearTerm', densityProfile.linearTerms)
  layers.packDensityProfiles('constantTerm', densityProfile.constantTerms)

  let totalMinHeight = Infinity
  let totalMaxHeight = 0
  let shadowBottomHeight = Infinity
  let shadowTopHeight = 0
  shadowLayerMask.fill(0)
  for (let i = 0; i < layers.length; ++i) {
    const { altitude, height, shadow } = layers[i]
    const maxHeight = altitude + height
    if (height > 0) {
      if (altitude < totalMinHeight) {
        totalMinHeight = altitude
      }
      if (shadow && altitude < shadowBottomHeight) {
        shadowBottomHeight = altitude
      }
      if (maxHeight > totalMaxHeight) {
        totalMaxHeight = maxHeight
      }
      if (shadow && maxHeight > shadowTopHeight) {
        shadowTopHeight = maxHeight
      }
    }
    shadowLayerMask[i] = shadow ? 1 : 0
  }
  if (totalMinHeight !== Infinity) {
    uniforms.minHeight.value = totalMinHeight
    uniforms.maxHeight.value = totalMaxHeight
  } else {
    invariant(totalMaxHeight === 0)
    uniforms.minHeight.value = 0
  }
  if (shadowBottomHeight !== Infinity) {
    uniforms.shadowBottomHeight.value = shadowBottomHeight
    uniforms.shadowTopHeight.value = shadowTopHeight
  } else {
    invariant(shadowTopHeight === 0)
    uniforms.shadowBottomHeight.value = 0
  }
  uniforms.shadowLayerMask.value.fromArray(shadowLayerMask)
}

export interface AtmosphereUniforms {
  bottomRadius: Uniform<number>
  topRadius: Uniform<number>
  worldToECEFMatrix: Uniform<Matrix4>
  ecefToWorldMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>
}

// prettier-ignore
export type AtmosphereUniformInstances = {
  [K in keyof AtmosphereUniforms as
    AtmosphereUniforms[K]['value'] extends Primitive ? never : K
  ]: AtmosphereUniforms[K]['value']
}

export function createAtmosphereUniforms(
  atmosphere: AtmosphereParameters,
  instances: AtmosphereUniformInstances
): AtmosphereUniforms {
  return {
    bottomRadius: new Uniform(atmosphere.bottomRadius),
    topRadius: new Uniform(atmosphere.topRadius),
    worldToECEFMatrix: new Uniform(instances.worldToECEFMatrix),
    ecefToWorldMatrix: new Uniform(instances.ecefToWorldMatrix),
    altitudeCorrection: new Uniform(instances.altitudeCorrection),
    sunDirection: new Uniform(instances.sunDirection)
  }
}
