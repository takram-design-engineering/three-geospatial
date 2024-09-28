/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { applyProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Uniform, type Texture } from 'three'

import fragmentShader from './shaders/normal.frag'

export interface NormalEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
}

export class NormalEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.SRC,
    normalBuffer = null
  }: NormalEffectOptions = {}) {
    super('NormalEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map([['normalBuffer', new Uniform(normalBuffer)]])
    })
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }
}

export const Normal = forwardRef<
  Effect,
  Omit<NormalEffectOptions, 'normalBuffer'>
>((props, forwardedRef) => {
  const effect = useMemo(() => new NormalEffect(), [])
  applyProps(effect, props)

  const { normalPass } = useContext(EffectComposerContext)
  useEffect(() => {
    effect.normalBuffer = normalPass?.texture ?? null
  }, [effect, normalPass])

  return <primitive ref={forwardedRef} object={effect} />
})
