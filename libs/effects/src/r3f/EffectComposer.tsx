import { useFrame, useInstanceHandle, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import {
  Effect,
  EffectAttribute,
  EffectComposer as EffectComposerImpl,
  EffectPass,
  Pass
} from 'postprocessing'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type Context,
  type ReactNode
} from 'react'
import {
  HalfFloatType,
  NoToneMapping,
  type Camera,
  type Scene,
  type TextureDataType
} from 'three'

import { GeometryPass } from '../GeometryPass'

type InferContextValue<T> = T extends Context<infer U> ? U : never

export interface EffectComposerContextValue
  extends InferContextValue<typeof EffectComposerContext> {
  geometryPass?: GeometryPass
}

export interface EffectComposerProps {
  enabled?: boolean
  depthBuffer?: boolean
  stencilBuffer?: boolean
  autoClear?: boolean
  resolutionScale?: number
  multisampling?: number
  frameBufferType?: TextureDataType
  renderPriority?: number
  camera?: Camera
  scene?: Scene
  children?: ReactNode
}

function isConvolution(effect: Effect): boolean {
  return (
    (effect.getAttributes() & EffectAttribute.CONVOLUTION) ===
    EffectAttribute.CONVOLUTION
  )
}

export const EffectComposer = /*#__PURE__*/ forwardRef<
  EffectComposerImpl,
  EffectComposerProps
>(function EffectComposer(
  {
    children,
    camera: cameraProp,
    scene: sceneProp,
    enabled = true,
    renderPriority = 1,
    autoClear = true,
    resolutionScale,
    depthBuffer,
    stencilBuffer = false,
    multisampling = 8,
    frameBufferType = HalfFloatType
  },
  forwardedRef
) {
  const gl = useThree(({ gl }) => gl)
  const defaultScene = useThree(({ scene }) => scene)
  const defaultCamera = useThree(({ camera }) => camera)
  const scene = sceneProp ?? defaultScene
  const camera = cameraProp ?? defaultCamera

  const [composer, geometryPass] = useMemo(() => {
    const composer = new EffectComposerImpl(gl, {
      depthBuffer,
      stencilBuffer,
      multisampling,
      frameBufferType
    })
    const geometryPass = new GeometryPass(composer.inputBuffer, scene, camera)
    composer.addPass(geometryPass)
    return [composer, geometryPass]
  }, [
    gl,
    scene,
    camera,
    depthBuffer,
    stencilBuffer,
    multisampling,
    frameBufferType
  ])

  const size = useThree(({ size }) => size)
  useEffect(() => {
    composer?.setSize(size.width, size.height)
  }, [composer, size])

  useFrame(
    (state, delta) => {
      if (enabled) {
        const currentAutoClear = gl.autoClear
        gl.autoClear = autoClear
        if (stencilBuffer && !autoClear) {
          gl.clearStencil()
        }
        composer.render(delta)
        gl.autoClear = currentAutoClear
      }
    },
    enabled ? renderPriority : 0
  )

  const group = useRef(null)
  const instance = useInstanceHandle(group)
  useLayoutEffect(() => {
    const passes: Pass[] = []
    if (group.current != null && instance.current != null && composer != null) {
      const children = instance.current.objects as unknown[]
      for (let i = 0; i < children.length; ++i) {
        const child = children[i]
        if (child instanceof Effect) {
          const effects: Effect[] = [child]
          if (!isConvolution(child)) {
            let next: unknown = null
            while ((next = children[i + 1]) instanceof Effect) {
              if (isConvolution(next)) {
                break
              }
              effects.push(next)
              ++i
            }
          }
          const pass = new EffectPass(camera, ...effects)
          passes.push(pass)
        } else if (child instanceof Pass) {
          passes.push(child)
        }
      }
      for (const pass of passes) {
        composer?.addPass(pass)
      }
    }

    return () => {
      for (const pass of passes) {
        composer?.removePass(pass)
      }
    }
  }, [composer, children, camera, instance])

  useEffect(() => {
    const currentToneMapping = gl.toneMapping
    gl.toneMapping = NoToneMapping
    return () => {
      gl.toneMapping = currentToneMapping
    }
  }, [gl])

  const context = useMemo(
    (): EffectComposerContextValue => ({
      composer,
      camera,
      scene,
      geometryPass,
      normalPass: null,
      downSamplingPass: null,
      resolutionScale
    }),
    [composer, camera, scene, geometryPass, resolutionScale]
  )

  useImperativeHandle(forwardedRef, () => composer, [composer])

  return (
    <EffectComposerContext.Provider value={context}>
      <group ref={group}>{children}</group>
    </EffectComposerContext.Provider>
  )
})
