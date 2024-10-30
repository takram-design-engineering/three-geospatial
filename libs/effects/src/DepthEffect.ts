/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

import fragmentShader from './shaders/depthEffect.frag'

export interface DepthEffectOptions {
  blendFunction?: BlendFunction
  useTurbo?: boolean
  near?: number
  far?: number
}

export const depthEffectOptionsDefaults = {
  blendFunction: BlendFunction.SRC,
  useTurbo: false,
  near: 1,
  far: 1000
} satisfies DepthEffectOptions

export class DepthEffect extends Effect {
  constructor(options?: DepthEffectOptions) {
    const { blendFunction, useTurbo, near, far } = {
      ...depthEffectOptionsDefaults,
      ...options
    }

    super('DepthEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['near', new Uniform(near)],
        ['far', new Uniform(far)]
      ])
    })
    this.useTurbo = useTurbo
  }

  get useTurbo(): boolean {
    return this.defines.has('USE_TURBO')
  }

  set useTurbo(value: boolean) {
    if (this.useTurbo !== value) {
      if (value) {
        this.defines.set('USE_TURBO', '1')
      } else {
        this.defines.delete('USE_TURBO')
      }
      this.setChanged()
    }
  }

  get near(): number {
    return this.uniforms.get('near')!.value
  }

  set near(value: number) {
    this.uniforms.get('near')!.value = value
  }

  get far(): number {
    return this.uniforms.get('far')!.value
  }

  set far(value: number) {
    this.uniforms.get('far')!.value = value
  }
}
