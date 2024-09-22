/// <reference types="vite-plugin-glsl/ext" />

import { EffectComposerContext } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import { Uniform, type Texture } from 'three'
import invariant from 'tiny-invariant'

import fragmentShader from './shaders/normal.glsl'

export interface NormalEffectOptions {
  blendFunction?: BlendFunction
  map?: Texture | null
}

export class NormalEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.SRC,
    map = null
  }: NormalEffectOptions = {}) {
    super('NormalEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map([['map', new Uniform(map)]])
    })
  }

  get map(): Texture | null {
    const uniform = this.uniforms.get('map')
    invariant(uniform != null)
    return uniform.value
  }

  set map(value: Texture | null) {
    const uniform = this.uniforms.get('map')
    invariant(uniform != null)
    uniform.value = value
  }
}

export interface NormalProps {
  blendFunction?: BlendFunction
}

export const Normal = forwardRef<Effect, NormalProps>((props, ref) => {
  const effect = useMemo(() => new NormalEffect(), [])

  const { normalPass } = useContext(EffectComposerContext)
  useEffect(() => {
    effect.map = normalPass?.texture ?? null
  }, [effect, normalPass])

  return <primitive ref={ref} object={effect} />
})
