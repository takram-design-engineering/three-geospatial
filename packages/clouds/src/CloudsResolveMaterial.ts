/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { GLSL3, RawShaderMaterial, Uniform, Vector2, type Texture } from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'

import fragmentShader from './shaders/cloudsResolve.frag?raw'
import vertexShader from './shaders/cloudsResolve.vert?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface CloudsResolveMaterialParameters {
  colorBuffer?: Texture | null
  depthVelocityBuffer?: Texture | null
  shadowLengthBuffer?: Texture | null
  colorHistoryBuffer?: Texture | null
  shadowLengthHistoryBuffer?: Texture | null
}

interface CloudsResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  colorBuffer: Uniform<Texture | null>
  depthVelocityBuffer: Uniform<Texture | null>
  shadowLengthBuffer: Uniform<Texture | null>
  colorHistoryBuffer: Uniform<Texture | null>
  shadowLengthHistoryBuffer: Uniform<Texture | null>
  texelSize: Uniform<Vector2>
  frame: Uniform<number>
  varianceGamma: Uniform<number>
  temporalAlpha: Uniform<number>
}

export interface CloudsResolveMaterial {
  uniforms: CloudsResolveMaterialUniforms
}

export class CloudsResolveMaterial extends RawShaderMaterial {
  constructor({
    colorBuffer = null,
    depthVelocityBuffer = null,
    shadowLengthBuffer = null,
    colorHistoryBuffer = null,
    shadowLengthHistoryBuffer = null
  }: CloudsResolveMaterialParameters = {}) {
    super({
      name: 'CloudsResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          varianceClipping
        })
      ),
      uniforms: {
        colorBuffer: new Uniform(colorBuffer),
        depthVelocityBuffer: new Uniform(depthVelocityBuffer),
        shadowLengthBuffer: new Uniform(shadowLengthBuffer),
        colorHistoryBuffer: new Uniform(colorHistoryBuffer),
        shadowLengthHistoryBuffer: new Uniform(shadowLengthHistoryBuffer),
        texelSize: new Uniform(new Vector2()),
        frame: new Uniform(0),
        varianceGamma: new Uniform(2),
        temporalAlpha: new Uniform(0.1)
      } satisfies CloudsResolveMaterialUniforms,
      defines: {}
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
  }

  get temporalUpscaling(): boolean {
    return this.defines.TEMPORAL_UPSCALING != null
  }

  set temporalUpscaling(value: boolean) {
    if (value !== this.temporalUpscaling) {
      if (value) {
        this.defines.TEMPORAL_UPSCALING = '1'
      } else {
        delete this.defines.TEMPORAL_UPSCALING
      }
      this.needsUpdate = true
    }
  }
}
