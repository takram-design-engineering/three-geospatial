import { Uniform, Vector2, Vector4, type Texture } from 'three'

export interface CloudParameterUniforms {
  // Shape and weather
  shapeTexture: Uniform<Texture | null>
  shapeFrequency: Uniform<number>
  shapeDetailTexture: Uniform<Texture | null>
  shapeDetailFrequency: Uniform<number>
  localWeatherTexture: Uniform<Texture | null>
  localWeatherFrequency: Uniform<Vector2>
  coverage: Uniform<number>
}

export function createCloudParameterUniforms(): CloudParameterUniforms {
  return {
    shapeTexture: new Uniform(null),
    shapeFrequency: new Uniform(0.0003),
    shapeDetailTexture: new Uniform(null),
    shapeDetailFrequency: new Uniform(0.007),
    localWeatherTexture: new Uniform(null),
    localWeatherFrequency: new Uniform(new Vector2(300, 150)),
    coverage: new Uniform(0.3)
  }
}

export interface CloudLayerUniforms {
  minLayerHeights: Uniform<Vector4>
  maxLayerHeights: Uniform<Vector4>
  extinctionCoeffs: Uniform<Vector4>
  detailAmounts: Uniform<Vector4>
  weatherExponents: Uniform<Vector4>
  coverageFilterWidths: Uniform<Vector4>
  minHeight: Uniform<number>
  maxHeight: Uniform<number>
}

export function createCloudLayerUniforms(): CloudLayerUniforms {
  return {
    minLayerHeights: new Uniform(new Vector4()),
    maxLayerHeights: new Uniform(new Vector4()),
    extinctionCoeffs: new Uniform(new Vector4()),
    detailAmounts: new Uniform(new Vector4()),
    weatherExponents: new Uniform(new Vector4()),
    coverageFilterWidths: new Uniform(new Vector4()),
    minHeight: new Uniform(0),
    maxHeight: new Uniform(0)
  }
}

export interface CloudLayer {
  minHeight: number
  maxHeight: number
  extinctionCoeff: number
  detailAmount: number
  weatherExponent: number
  coverageFilterWidth: number
}

export type CloudLayers = [CloudLayer, CloudLayer, CloudLayer, CloudLayer]

function packVector<K extends keyof CloudLayer>(
  layers: CloudLayers,
  key: K,
  result: Vector4
): Vector4 {
  return result.set(
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
  const minHeights = packVector(
    layers,
    'minHeight',
    uniforms.minLayerHeights.value
  )
  const maxHeights = packVector(
    layers,
    'maxHeight',
    uniforms.maxLayerHeights.value
  )
  packVector(layers, 'extinctionCoeff', uniforms.extinctionCoeffs.value)
  packVector(layers, 'detailAmount', uniforms.detailAmounts.value)
  packVector(layers, 'weatherExponent', uniforms.weatherExponents.value)
  packVector(layers, 'coverageFilterWidth', uniforms.coverageFilterWidths.value)

  // Exclude zero heights that effectively disable the layer.
  uniforms.minHeight.value = Math.min(
    ...[minHeights.x, minHeights.y, minHeights.z, minHeights.w].filter(
      value => value > 0
    )
  )
  uniforms.maxHeight.value = Math.max(
    ...[maxHeights.x, maxHeights.y, maxHeights.z, maxHeights.w].filter(
      value => value > 0
    )
  )
}
