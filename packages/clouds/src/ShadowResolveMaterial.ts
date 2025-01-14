/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type Texture
} from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'

import fragmentShader from './shaders/shadowResolve.frag?raw'
import vertexShader from './shaders/shadowResolve.vert?raw'
import textureCatmullRom from './shaders/textureCatmullRom.glsl?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface ShadowResolveMaterialParameters {
  inputBuffer?: Texture | null
  historyBuffer?: Texture | null
}

interface ShadowResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
  reprojectionMatrices: Uniform<Matrix4[]>
  texelSize: Uniform<Vector2>
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
      fragmentShader: resolveIncludes(unrollLoops(fragmentShader), {
        textureCatmullRom,
        varianceClipping
      }),
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        historyBuffer: new Uniform(historyBuffer),
        reprojectionMatrices: new Uniform(
          Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
        ),
        texelSize: new Uniform(new Vector2()),
        temporalAlpha: new Uniform(0.01)
      } satisfies ShadowResolveMaterialUniforms,
      defines: {}
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
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
