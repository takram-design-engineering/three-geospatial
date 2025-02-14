import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

import {
  define,
  resolveIncludes,
  type UniformMap
} from '@takram/three-geospatial'
import { depth, turbo } from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/depthEffect.frag?raw'

export interface DepthEffectOptions {
  blendFunction?: BlendFunction
  useTurbo?: boolean
  near?: number
  far?: number
}

export interface DepthEffectUniforms {
  near: Uniform<number>
  far: Uniform<number>
}
export const depthEffectOptionsDefaults = {
  blendFunction: BlendFunction.SRC,
  useTurbo: false,
  near: 1,
  far: 1000
} satisfies DepthEffectOptions

export class DepthEffect extends Effect {
  declare uniforms: UniformMap<DepthEffectUniforms>

  constructor(options?: DepthEffectOptions) {
    const { blendFunction, useTurbo, near, far } = {
      ...depthEffectOptionsDefaults,
      ...options
    }

    super(
      'DepthEffect',
      resolveIncludes(fragmentShader, {
        core: { depth, turbo }
      }),
      {
        blendFunction,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map(
          Object.entries({
            near: new Uniform(near),
            far: new Uniform(far)
          } satisfies DepthEffectUniforms)
        )
      }
    )
    this.useTurbo = useTurbo
  }

  @define('USE_TURBO')
  useTurbo: boolean

  get near(): number {
    return this.uniforms.get('near').value
  }

  set near(value: number) {
    this.uniforms.get('near').value = value
  }

  get far(): number {
    return this.uniforms.get('far').value
  }

  set far(value: number) {
    this.uniforms.get('far').value = value
  }
}
