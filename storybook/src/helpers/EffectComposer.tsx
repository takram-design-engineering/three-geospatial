import {
  EffectComposer as WrappedEffectComposer,
  type EffectComposerProps
} from '@react-three/postprocessing'
import {
  NormalPass,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { useLayoutEffect, useRef, type FC, type RefAttributes } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { HalfFloatType, type WebGLRenderTarget } from 'three'
import invariant from 'tiny-invariant'

import { reinterpretType } from '@takram/three-geospatial'

// Provided for half-float normal buffer.
export const EffectComposer: FC<
  EffectComposerProps & RefAttributes<EffectComposerImpl>
> = ({ ref: forwardedRef, ...props }) => {
  const ref = useRef<EffectComposerImpl>(null)
  useLayoutEffect(() => {
    const composer = ref.current
    invariant(ref.current != null)
    const normalPass = composer?.passes.find(pass => pass instanceof NormalPass)
    invariant(normalPass != null)
    reinterpretType<NormalPass & { renderTarget: WebGLRenderTarget }>(
      normalPass
    )
    normalPass.renderTarget.texture.type = HalfFloatType
  }, [])

  return (
    <WrappedEffectComposer
      ref={mergeRefs([ref, forwardedRef])}
      {...props}
      enableNormalPass
    />
  )
}
