import { useFrame, useThree, type Instance } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import {
  Effect,
  EffectAttribute,
  EffectComposer as EffectComposerImpl,
  EffectPass,
  Pass
} from 'postprocessing'
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type Context,
  type FC,
  type ReactNode,
  type RefAttributes
} from 'react'
import {
  HalfFloatType,
  NoToneMapping,
  type Camera,
  type Group,
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

export const EffectComposer: FC<
  EffectComposerProps & RefAttributes<EffectComposerImpl>
> = ({
  ref: forwardedRef,
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
}) => {
  const renderer = useThree(({ gl }) => gl)
  const defaultScene = useThree(({ scene }) => scene)
  const defaultCamera = useThree(({ camera }) => camera)
  const scene = sceneProp ?? defaultScene
  const camera = cameraProp ?? defaultCamera

  const [composer, geometryPass] = useMemo(() => {
    const composer = new EffectComposerImpl(renderer, {
      depthBuffer,
      stencilBuffer,
      multisampling,
      frameBufferType
    })
    const geometryPass = new GeometryPass(composer.inputBuffer, scene, camera)
    composer.addPass(geometryPass)
    return [composer, geometryPass]
  }, [
    renderer,
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
        const currentAutoClear = renderer.autoClear
        renderer.autoClear = autoClear
        if (stencilBuffer && !autoClear) {
          renderer.clearStencil()
        }
        composer.render(delta)
        renderer.autoClear = currentAutoClear
      }
    },
    enabled ? renderPriority : 0
  )

  const group = useRef<Group>(null)
  useLayoutEffect(() => {
    const passes: Pass[] = []
    const groupInstance = (
      group.current as (Group & { __r3f: Instance<Group> }) | null
    )?.__r3f
    if (groupInstance != null && composer != null) {
      const children = groupInstance.children
      for (let i = 0; i < children.length; ++i) {
        const child = children[i].object
        if (child instanceof Effect) {
          const effects: Effect[] = [child]
          if (!isConvolution(child)) {
            // eslint-disable-next-line no-useless-assignment
            let next: unknown = null
            while ((next = children[i + 1]?.object) instanceof Effect) {
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
  }, [composer, children, camera])

  useEffect(() => {
    const currentToneMapping = renderer.toneMapping
    renderer.toneMapping = NoToneMapping
    return () => {
      renderer.toneMapping = currentToneMapping
    }
  }, [renderer])

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
}
