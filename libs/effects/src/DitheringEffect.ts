/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect } from 'postprocessing'

import fragmentShader from './shaders/ditheringEffect.frag'

export interface DitheringEffectOptions {
  blendFunction?: BlendFunction
}

export const ditheringOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL
} satisfies DitheringEffectOptions

export class DitheringEffect extends Effect {
  constructor(options?: DitheringEffectOptions) {
    const { blendFunction } = {
      ...ditheringOptionsDefaults,
      ...options
    }

    super('DitheringEffect', fragmentShader, {
      blendFunction
    })
  }
}
