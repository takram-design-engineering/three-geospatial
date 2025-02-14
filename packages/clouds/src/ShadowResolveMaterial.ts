import {
  GLSL3,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type DataArrayTexture
} from 'three'

import {
  defineInt,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'

import { defaults } from './qualityPresets'

import fragmentShader from './shaders/shadowResolve.frag?raw'
import vertexShader from './shaders/shadowResolve.vert?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface ShadowResolveMaterialParameters {
  inputBuffer?: DataArrayTexture | null
  historyBuffer?: DataArrayTexture | null
}

export interface ShadowResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<DataArrayTexture | null>
  historyBuffer: Uniform<DataArrayTexture | null>
  texelSize: Uniform<Vector2>
  varianceGamma: Uniform<number>
  temporalAlpha: Uniform<number>
}

export class ShadowResolveMaterial extends RawShaderMaterial {
  declare uniforms: ShadowResolveMaterialUniforms

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
        texelSize: new Uniform(new Vector2()),
        varianceGamma: new Uniform(1),
        // Use a very slow alpha because a single flickering pixel can be highly
        // noticeable in shadow maps. This value can be increased if temporal
        // jitter is turned off in the shadows rendering, but it will suffer
        // from spatial aliasing.
        temporalAlpha: new Uniform(0.01)
      } satisfies ShadowResolveMaterialUniforms,
      defines: {}
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
  }

  @defineInt('CASCADE_COUNT', { min: 1, max: 4 })
  cascadeCount: number = defaults.shadow.cascadeCount
}
