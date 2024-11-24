/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, type Texture } from 'three'

import { packingShader } from '@takram/three-geospatial'

import fragmentShader from './shaders/geometryEffect.frag'

export type GeometryEffectOutput = 'normal' | 'pbr'

export interface GeometryEffectOptions {
  blendFunction?: BlendFunction
  geometryBuffer?: Texture | null
  output?: GeometryEffectOutput
}

export const geometryEffectOptionsDefaults = {
  blendFunction: BlendFunction.SRC,
  output: 'normal'
} satisfies GeometryEffectOptions

export class GeometryEffect extends Effect {
  constructor(options?: GeometryEffectOptions) {
    const {
      blendFunction,
      geometryBuffer = null,
      output
    } = {
      ...geometryEffectOptionsDefaults,
      ...options
    }
    super(
      'GeometryEffect',
      /* glsl */ `
        ${packingShader}
        ${fragmentShader}
      `,
      {
        blendFunction,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, Uniform>([
          ['geometryBuffer', new Uniform(geometryBuffer)]
        ])
      }
    )
    this.output = output
  }

  get geometryBuffer(): Texture | null {
    return this.uniforms.get('geometryBuffer')!.value
  }

  set geometryBuffer(value: Texture | null) {
    this.uniforms.get('geometryBuffer')!.value = value
  }

  get output(): GeometryEffectOutput {
    return this.defines.has('OUTPUT_NORMAL') ? 'normal' : 'pbr'
  }

  set output(value: GeometryEffectOutput) {
    if (value !== this.output) {
      if (value === 'normal') {
        this.defines.set('OUTPUT_NORMAL', '1')
      } else {
        this.defines.delete('OUTPUT_NORMAL')
      }
      if (value === 'pbr') {
        this.defines.set('OUTPUT_PBR', '1')
      } else {
        this.defines.delete('OUTPUT_PBR')
      }
      this.setChanged()
    }
  }
}
