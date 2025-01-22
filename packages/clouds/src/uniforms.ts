import { Uniform, Vector2, Vector3, Vector4, type Texture } from 'three'

export interface CloudParameterUniforms {
  // Weather and shape
  localWeatherTexture: Uniform<Texture | null>
  localWeatherFrequency: Uniform<Vector2>
  localWeatherOffset: Uniform<Vector2>
  coverage: Uniform<number>
  shapeTexture: Uniform<Texture | null>
  shapeFrequency: Uniform<Vector3>
  shapeOffset: Uniform<Vector3>
  shapeDetailTexture: Uniform<Texture | null>
  shapeDetailFrequency: Uniform<Vector3>
  shapeDetailOffset: Uniform<Vector3>
}

export function createCloudParameterUniforms({
  localWeatherTexture = null,
  shapeTexture = null,
  shapeDetailTexture = null
}: {
  localWeatherTexture?: Texture | null
  shapeTexture?: Texture | null
  shapeDetailTexture?: Texture | null
} = {}): CloudParameterUniforms {
  return {
    localWeatherTexture: new Uniform(localWeatherTexture),
    localWeatherFrequency: new Uniform(new Vector2(100, 100)),
    localWeatherOffset: new Uniform(new Vector2()),
    coverage: new Uniform(0.3),
    shapeTexture: new Uniform(shapeTexture),
    shapeFrequency: new Uniform(new Vector3().setScalar(0.0003)),
    shapeOffset: new Uniform(new Vector3()),
    shapeDetailTexture: new Uniform(shapeDetailTexture),
    shapeDetailFrequency: new Uniform(new Vector3().setScalar(0.006)),
    shapeDetailOffset: new Uniform(new Vector3())
  }
}

export interface CloudLayerUniforms {
  minLayerHeights: Uniform<Vector4>
  maxLayerHeights: Uniform<Vector4>
  extinctionCoefficients: Uniform<Vector4>
  detailAmounts: Uniform<Vector4>
  weatherExponents: Uniform<Vector4>
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
    extinctionCoefficients: new Uniform(new Vector4()),
    detailAmounts: new Uniform(new Vector4()),
    weatherExponents: new Uniform(new Vector4()),
    coverageFilterWidths: new Uniform(new Vector4()),
    minHeight: new Uniform(0),
    maxHeight: new Uniform(0),
    shadowTopHeight: new Uniform(0),
    shadowBottomHeight: new Uniform(0)
  }
}

export interface CloudLayer {
  minHeight: number
  maxHeight: number
  extinctionCoefficient: number
  detailAmount: number
  weatherExponent: number
  coverageFilterWidth: number
  shadow?: boolean
}

export type CloudLayers = [CloudLayer, CloudLayer, CloudLayer, CloudLayer]

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
  packVector(layers, 'minHeight', uniforms.minLayerHeights)
  packVector(layers, 'maxHeight', uniforms.maxLayerHeights)
  packVector(layers, 'extinctionCoefficient', uniforms.extinctionCoefficients)
  packVector(layers, 'detailAmount', uniforms.detailAmounts)
  packVector(layers, 'weatherExponent', uniforms.weatherExponents)
  packVector(layers, 'coverageFilterWidth', uniforms.coverageFilterWidths)

  let minHeight = Infinity
  let maxHeight = 0
  let shadowBottomHeight = Infinity
  let shadowTopHeight = 0
  for (let i = 0; i < layers.length; ++i) {
    const layer = layers[i]
    if (layer.minHeight > 0) {
      if (layer.minHeight < minHeight) {
        minHeight = layer.minHeight
      }
      if (layer.shadow === true && layer.minHeight < shadowBottomHeight) {
        shadowBottomHeight = layer.minHeight
      }
    }
    if (layer.maxHeight > 0) {
      if (layer.maxHeight > maxHeight) {
        maxHeight = layer.maxHeight
      }
      if (layer.shadow === true && layer.maxHeight > shadowTopHeight) {
        shadowTopHeight = layer.maxHeight
      }
    }
  }
  if (minHeight !== Infinity) {
    uniforms.minHeight.value = minHeight
    uniforms.maxHeight.value = maxHeight
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
