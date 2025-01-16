/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { GLSL3, RawShaderMaterial, Uniform, type Texture } from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'

import fragmentShader from './shaders/shadowResolve.frag?raw'
import vertexShader from './shaders/shadowResolve.vert?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface ShadowResolveMaterialParameters {
  inputBuffer?: Texture | null
  historyBuffer?: Texture | null
}

interface ShadowResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
  temporalAlpha: Uniform<number>
}

export interface ShadowResolveMaterial {
  uniforms: ShadowResolveMaterialUniforms
}

export class ShadowResolveMaterial extends RawShaderMaterial {
  constructor({
    inputBuffer = null,
    historyBuffer = null
  }: ShadowResolveMaterialParameters = {}) {
    super({
      name: 'ShadowResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          varianceClipping
        })
      ),
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        historyBuffer: new Uniform(historyBuffer),
        temporalAlpha: new Uniform(0.01)
      } satisfies ShadowResolveMaterialUniforms,
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
