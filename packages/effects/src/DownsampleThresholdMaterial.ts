import {
  NoBlending,
  ShaderMaterial,
  Uniform,
  Vector2,
  type ShaderMaterialParameters,
  type Texture
} from 'three'

import fragmentShader from './shaders/downsampleThreshold.frag?raw'
import vertexShader from './shaders/downsampleThreshold.vert?raw'

export interface DownsampleThresholdMaterialParameters
  extends ShaderMaterialParameters {
  inputBuffer?: Texture | null
  thresholdLevel?: number
  thresholdRange?: number
}

export const downsampleThresholdMaterialParametersDefaults = {
  thresholdLevel: 10,
  thresholdRange: 1
} satisfies DownsampleThresholdMaterialParameters

export class DownsampleThresholdMaterial extends ShaderMaterial {
  constructor(params?: DownsampleThresholdMaterialParameters) {
    const {
      inputBuffer = null,
      thresholdLevel,
      thresholdRange,
      ...others
    } = {
      ...downsampleThresholdMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'DownsampleThresholdMaterial',
      fragmentShader,
      vertexShader,
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        texelSize: new Uniform(new Vector2()),
        thresholdLevel: new Uniform(thresholdLevel),
        thresholdRange: new Uniform(thresholdRange),
        ...others.uniforms
      }
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  get thresholdLevel(): number {
    return this.uniforms.thresholdLevel.value
  }

  set thresholdLevel(value: number) {
    this.uniforms.thresholdLevel.value = value
  }

  get thresholdRange(): number {
    return this.uniforms.thresholdRange.value
  }

  set thresholdRange(value: number) {
    this.uniforms.thresholdRange.value = value
  }
}
