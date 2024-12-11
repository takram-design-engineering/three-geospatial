/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { EffectAttribute } from 'postprocessing'
import { type Camera, type Uniform } from 'three'

import {
  AtmosphereEffectBase,
  atmosphereEffectBaseOptionsDefaults,
  AtmosphereParameters,
  type AtmosphereEffectBaseOptions
} from '@takram/three-atmosphere'
import { functions, parameters } from '@takram/three-atmosphere/shaders'

import fragmentShader from './shaders/cloudsEffect.frag'
import vertexShader from './shaders/cloudsEffect.vert'

export interface CloudsEffectOptions extends AtmosphereEffectBaseOptions {}

export const cloudsEffectOptionsDefaults = {
  ...atmosphereEffectBaseOptionsDefaults
} satisfies CloudsEffectOptions

export class CloudsEffect extends AtmosphereEffectBase {
  constructor(
    camera: Camera,
    options?: CloudsEffectOptions,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super(
      'CloudsEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${fragmentShader}
      `,
      camera,
      {
        ...options,
        vertexShader: /* glsl */ `
          ${parameters}
          ${vertexShader}
        `,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, Uniform>([])
      },
      atmosphere
    )
  }
}
