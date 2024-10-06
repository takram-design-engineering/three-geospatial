/// <reference types="vite-plugin-glsl/ext" />

import {
  NoBlending,
  ShaderMaterial,
  Uniform,
  Vector2,
  type ShaderMaterialParameters,
  type Texture
} from 'three'

import fragmentShader from './shaders/downsampleThreshold.frag'
import vertexShader from './shaders/downsampleThreshold.vert'

export interface DownsampleThresholdMaterialParameters
  extends ShaderMaterialParameters {
  inputBuffer?: Texture | null
  thresholdLevel?: number
  thresholdRange?: number
  logarithmBase?: number
}

export const downsampleThresholdMaterialParametersDefaults = {
  thresholdLevel: 10,
  thresholdRange: 1,
  logarithmBase: 1.5
} satisfies DownsampleThresholdMaterialParameters

export class DownsampleThresholdMaterial extends ShaderMaterial {
  constructor(params?: DownsampleThresholdMaterialParameters) {
    const {
      inputBuffer,
      thresholdLevel,
      thresholdRange,
      logarithmBase,
      ...others
    } = {
      ...downsampleThresholdMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'DownsampleThresholdMaterial',
      fragmentShader,
      vertexShader,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer ?? null),
        texelSize: new Uniform(new Vector2()),
        thresholdLevel: new Uniform(thresholdLevel),
        thresholdRange: new Uniform(thresholdRange),
        logarithmBase: new Uniform(logarithmBase)
      },
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others
    })
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  setSize(width: number, height: number): void {
    const texelSize = this.uniforms.texelSize.value
    texelSize.x = 1 / width
    texelSize.y = 1 / height
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

  get logarithmBase(): number {
    return this.uniforms.logarithmBase.value
  }

  set logarithmBase(value: number) {
    this.uniforms.logarithmBase.value = value
  }
}
