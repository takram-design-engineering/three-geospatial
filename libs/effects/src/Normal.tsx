/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import {
  EffectComposerContext,
  type EffectProps
} from '@react-three/postprocessing'
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
    blendFunction = BlendFunction.NORMAL,
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

export interface NormalProps extends EffectProps<typeof NormalEffect> {}

export const Normal = forwardRef<NormalEffect, NormalProps>(function Normal(
  { blendFunction, ...props },
  forwardedRef
) {
  const effect = useMemo(
    () => new NormalEffect({ blendFunction }),
    [blendFunction]
  )
  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  const { normalPass } = useContext(EffectComposerContext)
  return (
    <primitive
      ref={forwardedRef}
      object={effect}
      normalBuffer={normalPass?.texture ?? null}
      {...props}
    />
  )
})
