/// <reference types="vite-plugin-glsl/ext" />

import { wrapEffect } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'

import fragmentShader from './shaders/depth.glsl'

export interface DepthEffectOptions {
  blendFunction?: BlendFunction
  useTurbo?: boolean
}

export class DepthEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.SRC,
    useTurbo = false
  }: DepthEffectOptions = {}) {
    super('DepthEffect', fragmentShader, {
      blendFunction,
      attributes: EffectAttribute.DEPTH
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
}

export const Depth = wrapEffect(DepthEffect)
