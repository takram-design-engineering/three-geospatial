import { GLSL3, RawShaderMaterial, Uniform, type Texture } from 'three'

import fragmentShader from './shaders/cloudsHistory.frag?raw'
import vertexShader from './shaders/cloudsHistory.vert?raw'

export interface CloudsHistoryMaterialParameters {
  colorBuffer?: Texture | null
  shadowLengthBuffer?: Texture | null
}

export interface CloudsHistoryMaterialUniforms {
  [key: string]: Uniform<unknown>
  colorBuffer: Uniform<Texture | null>
  shadowLengthBuffer: Uniform<Texture | null>
}

export class CloudsHistoryMaterial extends RawShaderMaterial {
  declare uniforms: CloudsHistoryMaterialUniforms

  constructor({
    colorBuffer = null,
    shadowLengthBuffer = null
  }: CloudsHistoryMaterialParameters = {}) {
    super({
      name: 'CloudsHistoryMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        colorBuffer: new Uniform(colorBuffer),
        shadowLengthBuffer: new Uniform(shadowLengthBuffer)
      } satisfies CloudsHistoryMaterialUniforms,
      defines: {}
    })
  }

  get shadowLength(): boolean {
    return this.defines.SHADOW_LENGTH != null
  }

  set shadowLength(value: boolean) {
    if (value !== this.shadowLength) {
      if (value) {
        this.defines.SHADOW_LENGTH = '1'
      } else {
        delete this.defines.SHADOW_LENGTH
      }
      this.needsUpdate = true
    }
  }
}
