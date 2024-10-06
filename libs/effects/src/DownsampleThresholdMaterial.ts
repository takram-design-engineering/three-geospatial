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
  level?: number
  range?: number
  base?: number
}

export const downsampleThresholdMaterialParametersDefaults = {
  level: 10,
  range: 1,
  base: 1.5
} satisfies DownsampleThresholdMaterialParameters

export class DownsampleThresholdMaterial extends ShaderMaterial {
  constructor(params?: DownsampleThresholdMaterialParameters) {
    const { inputBuffer, level, range, base, ...others } = {
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
        level: new Uniform(level),
        range: new Uniform(range),
        base: new Uniform(base)
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

  get level(): number {
    return this.uniforms.level.value
  }

  set level(value: number) {
    this.uniforms.level.value = value
  }

  get range(): number {
    return this.uniforms.range.value
  }

  set range(value: number) {
    this.uniforms.range.value = value
  }

  get base(): number {
    return this.uniforms.base.value
  }

  set base(value: number) {
    this.uniforms.base.value = value
  }
}
