import { BlendFunction, Effect } from 'postprocessing'

import fragmentShader from './shaders/ditheringEffect.frag?raw'

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
