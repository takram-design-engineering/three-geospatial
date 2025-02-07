import {
  Uniform,
  Vector3,
  Vector4,
  type Data3DTexture,
  type Matrix4,
  type Texture,
  type Vector2
} from 'three'
import { type Primitive } from 'type-fest'

import { type AtmosphereParameters } from '@takram/three-atmosphere'

import {
  defaultCloudLayer,
  type CloudLayer,
  type DensityProfile
} from './cloudLayer'

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
    absorptionCoefficient: new Uniform(0.02),

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
  expScales: Vector4
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
    densityProfile: new Uniform({
      expTerms: new Vector4(),
      expScales: new Vector4(),
      linearTerms: new Vector4(),
      constantTerms: new Vector4()
    })
  }
}

type NumericLayerKey = keyof {
  [P in keyof CloudLayer as number extends CloudLayer[P] ? P : never]: any
}

function packVector<K extends NumericLayerKey>(
  layers: readonly CloudLayer[],
  key: K,
  result: Vector4
): Vector4 {
  const defaultValue = defaultCloudLayer[key]
  return result.set(
    layers[0]?.[key] ?? defaultValue,
    layers[1]?.[key] ?? defaultValue,
    layers[2]?.[key] ?? defaultValue,
    layers[3]?.[key] ?? defaultValue
  )
}

function packVectorsSum<K1 extends NumericLayerKey, K2 extends NumericLayerKey>(
  layers: readonly CloudLayer[],
  key1: K1,
  key2: K2,
  result: Vector4
): Vector4 {
  const { [key1]: defaultValue1, [key2]: defaultValue2 } = defaultCloudLayer
  return result.set(
    (layers[0]?.[key1] ?? defaultValue1) + (layers[0]?.[key2] ?? defaultValue2),
    (layers[1]?.[key1] ?? defaultValue1) + (layers[1]?.[key2] ?? defaultValue2),
    (layers[2]?.[key1] ?? defaultValue1) + (layers[2]?.[key2] ?? defaultValue2),
    (layers[3]?.[key1] ?? defaultValue1) + (layers[3]?.[key2] ?? defaultValue2)
  )
}

function packDensityProfileVector<K extends keyof DensityProfile>(
  layers: readonly CloudLayer[],
  key: K,
  result: Vector4
): Vector4 {
  const defaultValue = defaultCloudLayer.densityProfile[key]
  return result.set(
    layers[0]?.densityProfile?.[key] ?? defaultValue,
    layers[1]?.densityProfile?.[key] ?? defaultValue,
    layers[2]?.densityProfile?.[key] ?? defaultValue,
    layers[3]?.densityProfile?.[key] ?? defaultValue
  )
}

function packDensityProfile(
  layers: readonly CloudLayer[],
  densityProfile: DensityProfileVectors
): void {
  packDensityProfileVector(layers, 'expTerm', densityProfile.expTerms)
  packDensityProfileVector(layers, 'expScale', densityProfile.expScales)
  packDensityProfileVector(layers, 'linearTerm', densityProfile.linearTerms)
  packDensityProfileVector(layers, 'constantTerm', densityProfile.constantTerms)
}

interface Interval {
  min: number
  max: number
}

const intervalsScratch: Interval[] = /*#__PURE__*/ Array.from(
  { length: 4 },
  () => ({ min: 0, max: 0 })
)

function compareIntervals(a: Interval, b: Interval): number {
  return a.min - b.min
}

function packIntervalHeights(
  minHeights: Vector4,
  maxHeights: Vector4,
  min: Vector3,
  max: Vector3
): void {
  let [a, b, c, d] = intervalsScratch
  ;[a.min, a.max] = [minHeights.x, maxHeights.x]
  ;[b.min, b.max] = [minHeights.y, maxHeights.y]
  ;[c.min, c.max] = [minHeights.z, maxHeights.z]
  ;[d.min, d.max] = [minHeights.w, maxHeights.w]
  intervalsScratch.sort(compareIntervals)
  ;[a, b, c, d] = intervalsScratch
  ;[min.x, max.x] = a.max < b.min ? [a.max, b.min] : [-1, -1]
  ;[min.y, max.y] = b.max < c.min ? [b.max, c.min] : [-1, -1]
  ;[min.z, max.z] = c.max < d.min ? [c.max, d.min] : [-1, -1]
}

export function updateCloudLayerUniforms(
  uniforms: CloudLayerUniforms,
  layers: readonly CloudLayer[]
): void {
  const minLayerHeights = packVector(
    layers,
    'altitude',
    uniforms.minLayerHeights.value
  )
  const maxLayerHeights = packVectorsSum(
    layers,
    'altitude',
    'height',
    uniforms.maxLayerHeights.value
  )
  packIntervalHeights(
    minLayerHeights,
    maxLayerHeights,
    uniforms.minIntervalHeights.value,
    uniforms.maxIntervalHeights.value
  )
  packVector(layers, 'densityScale', uniforms.densityScales.value)
  packVector(layers, 'shapeAmount', uniforms.shapeAmounts.value)
  packVector(layers, 'shapeDetailAmount', uniforms.shapeDetailAmounts.value)
  packVector(layers, 'weatherExponent', uniforms.weatherExponents.value)
  packVector(layers, 'shapeAlteringBias', uniforms.shapeAlteringBiases.value)
  packVector(layers, 'coverageFilterWidth', uniforms.coverageFilterWidths.value)
  packDensityProfile(layers, uniforms.densityProfile.value)

  let totalMinHeight = Infinity
  let totalMaxHeight = 0
  let shadowBottomHeight = Infinity
  let shadowTopHeight = 0
  for (let i = 0; i < layers.length; ++i) {
    const {
      altitude = defaultCloudLayer.altitude,
      height = defaultCloudLayer.height,
      shadow = defaultCloudLayer.shadow
    } = layers[i]

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
  }
  if (totalMinHeight !== Infinity) {
    uniforms.minHeight.value = totalMinHeight
    uniforms.maxHeight.value = totalMaxHeight
  } else {
    uniforms.minHeight.value = 0
    // TODO: Deal with empty cloud layers
  }
  if (shadowBottomHeight !== Infinity) {
    uniforms.shadowBottomHeight.value = shadowBottomHeight
    uniforms.shadowTopHeight.value = shadowTopHeight
  } else {
    uniforms.shadowBottomHeight.value = 0
    // TODO: Deal with empty cloud layers
  }
}

export interface AtmosphereUniforms {
  bottomRadius: Uniform<number>
  topRadius: Uniform<number>
  ellipsoidCenter: Uniform<Vector3>
  ellipsoidMatrix: Uniform<Matrix4>
  inverseEllipsoidMatrix: Uniform<Matrix4>
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
    ellipsoidCenter: new Uniform(instances.ellipsoidCenter),
    ellipsoidMatrix: new Uniform(instances.ellipsoidMatrix),
    inverseEllipsoidMatrix: new Uniform(instances.inverseEllipsoidMatrix),
    altitudeCorrection: new Uniform(instances.altitudeCorrection),
    sunDirection: new Uniform(instances.sunDirection)
  }
}
