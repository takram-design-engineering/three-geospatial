import {
  Uniform,
  Vector2,
  Vector3,
  Vector4,
  type Data3DTexture,
  type Texture
} from 'three'

import { type CloudLayer, type CloudLayers } from './types'

export interface CloudParameterUniforms {
  // Scattering
  scatteringCoefficient: Uniform<number>
  absorptionCoefficient: Uniform<number>

  // Weather and shape
  localWeatherTexture: Uniform<Texture | null>
  localWeatherRepeat: Uniform<Vector2>
  localWeatherOffset: Uniform<Vector2>
  coverage: Uniform<number>
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

export function createCloudParameterUniforms({
  localWeatherTexture = null,
  shapeTexture = null,
  shapeDetailTexture = null,
  turbulenceTexture = null
}: {
  localWeatherTexture?: Texture | null
  shapeTexture?: Data3DTexture | null
  shapeDetailTexture?: Data3DTexture | null
  turbulenceTexture?: Texture | null
} = {}): CloudParameterUniforms {
  return {
    // Scattering
    scatteringCoefficient: new Uniform(1.0),
    absorptionCoefficient: new Uniform(0.02),

    // Weather and shape
    localWeatherTexture: new Uniform(localWeatherTexture),
    localWeatherRepeat: new Uniform(new Vector2().setScalar(100)),
    localWeatherOffset: new Uniform(new Vector2()),
    coverage: new Uniform(0.3),
    shapeTexture: new Uniform(shapeTexture),
    shapeRepeat: new Uniform(new Vector3().setScalar(0.0003)),
    shapeOffset: new Uniform(new Vector3()),
    shapeDetailTexture: new Uniform(shapeDetailTexture),
    shapeDetailRepeat: new Uniform(new Vector3().setScalar(0.006)),
    shapeDetailOffset: new Uniform(new Vector3()),
    turbulenceTexture: new Uniform(turbulenceTexture),
    turbulenceRepeat: new Uniform(new Vector2().setScalar(20)),
    turbulenceDisplacement: new Uniform(350)
  }
}

export interface CloudLayerUniforms {
  minLayerHeights: Uniform<Vector4>
  maxLayerHeights: Uniform<Vector4>
  densityScales: Uniform<Vector4>
  shapeAmounts: Uniform<Vector4>
  detailAmounts: Uniform<Vector4>
  weatherExponents: Uniform<Vector4>
  shapeAlteringBiases: Uniform<Vector4>
  coverageFilterWidths: Uniform<Vector4>
  minHeight: Uniform<number>
  maxHeight: Uniform<number>
  shadowTopHeight: Uniform<number>
  shadowBottomHeight: Uniform<number>
}

export function createCloudLayerUniforms(): CloudLayerUniforms {
  return {
    minLayerHeights: new Uniform(new Vector4()),
    maxLayerHeights: new Uniform(new Vector4()),
    densityScales: new Uniform(new Vector4()),
    shapeAmounts: new Uniform(new Vector4()),
    detailAmounts: new Uniform(new Vector4()),
    weatherExponents: new Uniform(new Vector4()),
    shapeAlteringBiases: new Uniform(new Vector4()),
    coverageFilterWidths: new Uniform(new Vector4()),
    minHeight: new Uniform(0),
    maxHeight: new Uniform(0),
    shadowTopHeight: new Uniform(0),
    shadowBottomHeight: new Uniform(0)
  }
}

function packVector<
  K extends keyof {
    [P in keyof CloudLayer as CloudLayer[P] extends number ? P : never]: any
  }
>(layers: CloudLayers, key: K, uniform: Uniform<Vector4>): void {
  uniform.value.set(
    layers[0][key],
    layers[1][key],
    layers[2][key],
    layers[3][key]
  )
}

export function updateCloudLayerUniforms(
  uniforms: CloudLayerUniforms,
  layers: CloudLayers
): void {
  packVector(layers, 'altitude', uniforms.minLayerHeights)
  uniforms.maxLayerHeights.value.set(
    layers[0].altitude + layers[0].height,
    layers[1].altitude + layers[1].height,
    layers[2].altitude + layers[2].height,
    layers[3].altitude + layers[3].height
  )
  packVector(layers, 'densityScale', uniforms.densityScales)
  packVector(layers, 'shapeAmount', uniforms.shapeAmounts)
  packVector(layers, 'detailAmount', uniforms.detailAmounts)
  packVector(layers, 'weatherExponent', uniforms.weatherExponents)
  packVector(layers, 'shapeAlteringBias', uniforms.shapeAlteringBiases)
  packVector(layers, 'coverageFilterWidth', uniforms.coverageFilterWidths)

  let totalMinHeight = Infinity
  let totalMaxHeight = 0
  let shadowBottomHeight = Infinity
  let shadowTopHeight = 0
  for (let i = 0; i < layers.length; ++i) {
    const { altitude, height, shadow = false } = layers[i]
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
