/// <reference types="vite-plugin-glsl/ext" />

import { applyProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Uniform, type Texture } from 'three'
import invariant from 'tiny-invariant'

import fragmentShader from './shaders/normal.glsl'

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
    const uniform = this.uniforms.get('normalBuffer')
    invariant(uniform != null)
    return uniform.value
  }

  set normalBuffer(value: Texture | null) {
    const uniform = this.uniforms.get('normalBuffer')
    invariant(uniform != null)
    uniform.value = value
  }
}

export const Normal = forwardRef<
  Effect,
  Omit<NormalEffectOptions, 'normalBuffer'>
>((props, ref) => {
  const effect = useMemo(() => new NormalEffect(), [])
  applyProps(effect, props)

  const { normalPass } = useContext(EffectComposerContext)
  useEffect(() => {
    effect.normalBuffer = normalPass?.texture ?? null
  }, [effect, normalPass])

  return <primitive ref={ref} object={effect} />
})
