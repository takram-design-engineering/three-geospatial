/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { GLSL3, RawShaderMaterial, Uniform, type Texture } from 'three'

import fragmentShader from './shaders/cloudsHistory.frag?raw'
import vertexShader from './shaders/cloudsHistory.vert?raw'

export interface CloudsHistoryMaterialParameters {
  colorBuffer?: Texture | null
  shadowLengthBuffer?: Texture | null
}

interface CloudsHistoryMaterialUniforms {
  [key: string]: Uniform<unknown>
  colorBuffer: Uniform<Texture | null>
  shadowLengthBuffer: Uniform<Texture | null>
}

export interface CloudsHistoryMaterial {
  uniforms: CloudsHistoryMaterialUniforms
}

export class CloudsHistoryMaterial extends RawShaderMaterial {
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
}
