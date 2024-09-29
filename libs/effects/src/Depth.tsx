/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, type WebGLRenderer } from 'three'

import fragmentShader from './shaders/depth.frag'

export interface DepthEffectOptions {
  blendFunction?: BlendFunction
  useTurbo?: boolean
  near?: number
  far?: number
}

export class DepthEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.NORMAL,
    useTurbo = false,
    near = 1,
    far = 1000
  }: DepthEffectOptions = {}) {
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

  initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    super.initialize(renderer, alpha, frameBufferType)
    if (renderer.capabilities.logarithmicDepthBuffer) {
      this.defines.set('LOG_DEPTH', '1')
    } else {
      this.defines.delete('LOG_DEPTH')
    }
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

export const Depth = wrapEffect(DepthEffect)
