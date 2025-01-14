/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { GLSL3, RawShaderMaterial, Uniform, type Texture } from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'

import fragmentShader from './shaders/cloudsResolve.frag?raw'
import vertexShader from './shaders/cloudsResolve.vert?raw'
import textureCatmullRom from './shaders/textureCatmullRom.glsl?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface CloudsResolveMaterialParameters {
  inputBuffer?: Texture | null
  depthVelocityBuffer?: Texture | null
  historyBuffer?: Texture | null
}

interface CloudsResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  depthVelocityBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
  frame: Uniform<number>
  temporalAlpha: Uniform<number>
}

export interface CloudsResolveMaterial {
  uniforms: CloudsResolveMaterialUniforms
}

export class CloudsResolveMaterial extends RawShaderMaterial {
  constructor({
    inputBuffer = null,
    depthVelocityBuffer = null,
    historyBuffer = null
  }: CloudsResolveMaterialParameters = {}) {
    super({
      name: 'CloudsResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(unrollLoops(fragmentShader), {
        textureCatmullRom,
        varianceClipping
      }),
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        depthVelocityBuffer: new Uniform(depthVelocityBuffer),
        historyBuffer: new Uniform(historyBuffer),
        frame: new Uniform(0),
        temporalAlpha: new Uniform(0.1)
      } satisfies CloudsResolveMaterialUniforms,
      defines: {}
    })
  }

  get temporalUpscaling(): boolean {
    return this.defines.USE_TEMPORAL_UPSCALING != null
  }

  set temporalUpscaling(value: boolean) {
    if (value !== this.temporalUpscaling) {
      if (value) {
        this.defines.USE_TEMPORAL_UPSCALING = '1'
      } else {
        delete this.defines.USE_TEMPORAL_UPSCALING
      }
      this.needsUpdate = true
    }
  }
}
