/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { GLSL3, RawShaderMaterial, Uniform, type Texture } from 'three'

import { resolveIncludes } from '@takram/three-geospatial'
import { depth, math } from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/cloudsShadowResolve.frag?raw'
import vertexShader from './shaders/cloudsShadowResolve.vert?raw'

export interface CloudsShadowResolveMaterialParameters {
  inputBuffer?: Texture | null
  historyBuffer?: Texture | null
}

interface CloudsShadowResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
}

export interface CloudsShadowResolveMaterial {
  uniforms: CloudsShadowResolveMaterialUniforms
}

export class CloudsShadowResolveMaterial extends RawShaderMaterial {
  constructor({
    inputBuffer = null,
    historyBuffer = null
  }: CloudsShadowResolveMaterialParameters = {}) {
    super({
      name: 'CloudsShadowResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: {
          depth,
          math
        }
      }),
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        historyBuffer: new Uniform(historyBuffer)
      } satisfies CloudsShadowResolveMaterialUniforms,
      defines: {}
    })
  }

  get cascadeCount(): number {
    return +this.defines.CASCADE_COUNT
  }

  set cascadeCount(value: number) {
    if (value !== this.cascadeCount) {
      this.defines.CASCADE_COUNT = `${value}`
      this.needsUpdate = true
    }
  }
}
