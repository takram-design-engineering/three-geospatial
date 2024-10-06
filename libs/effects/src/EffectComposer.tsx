import { useFrame, useInstanceHandle, useThree } from '@react-three/fiber'
import {
  EffectComposerContext,
  type EffectComposerProps as BaseEffectComposerProps
} from '@react-three/postprocessing'
import {
  Effect,
  EffectAttribute,
  EffectComposer as EffectComposerImpl,
  EffectPass,
  NormalPass,
  Pass,
  RenderPass
} from 'postprocessing'
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react'
import { HalfFloatType, NoToneMapping, WebGLRenderTarget } from 'three'
import { isWebGL2Available } from 'three-stdlib'

// Provided for high-precision normal pass.

export interface EffectComposerProps
  extends Omit<
    BaseEffectComposerProps,
    'enableNormalPass' | 'resolutionScale'
  > {
  normalPass?: boolean
}

function isConvolution(effect: Effect): boolean {
  return (
    (effect.getAttributes() & EffectAttribute.CONVOLUTION) ===
    EffectAttribute.CONVOLUTION
  )
}

export const EffectComposer = memo(
  forwardRef(function EffectComposer(
    {
      children,
      camera: cameraProp,
      scene: sceneProp,
      enabled = true,
      renderPriority = 1,
      autoClear = true,
      depthBuffer,
      normalPass: enableNormalPass = false,
      stencilBuffer = false,
      multisampling = 8,
      frameBufferType = HalfFloatType
    }: EffectComposerProps,
    forwardedRef
  ) {
    const { gl, scene: defaultScene, camera: defaultCamera, size } = useThree()
    const scene = sceneProp ?? defaultScene
    const camera = cameraProp ?? defaultCamera

    const [composer, normalPass] = useMemo(() => {
      const webGL2Available = isWebGL2Available()
      const effectComposer = new EffectComposerImpl(gl, {
        depthBuffer,
        stencilBuffer,
        multisampling: multisampling > 0 && webGL2Available ? multisampling : 0,
        frameBufferType
      })
      effectComposer.addPass(new RenderPass(scene, camera))

      let normalPass = null
      if (enableNormalPass) {
        normalPass = new NormalPass(scene, camera, {
          // TODO: Should we dispose target?
          renderTarget: new WebGLRenderTarget(1, 1, {
            type: frameBufferType // We need high-precision normal.
          })
        })
        normalPass.enabled = false
        effectComposer.addPass(normalPass)
      }

      return [effectComposer, normalPass]
    }, [
      camera,
      gl,
      depthBuffer,
      stencilBuffer,
      multisampling,
      frameBufferType,
      scene,
      enableNormalPass
    ])

    useEffect(() => {
      composer?.setSize(size.width, size.height)
    }, [composer, size])

    useFrame(
      (state, delta) => {
        if (enabled) {
          const currentAutoClear = gl.autoClear
          gl.autoClear = autoClear
          if (stencilBuffer && !autoClear) gl.clearStencil()
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
      if (
        group.current != null &&
        instance.current != null &&
        composer != null
      ) {
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
        if (normalPass != null) {
          normalPass.enabled = true
        }
      }

      return () => {
        for (const pass of passes) {
          composer?.removePass(pass)
        }
        if (normalPass != null) {
          normalPass.enabled = false
        }
      }
    }, [composer, children, camera, normalPass, instance])

    useEffect(() => {
      const currentToneMapping = gl.toneMapping
      gl.toneMapping = NoToneMapping
      return () => {
        gl.toneMapping = currentToneMapping
      }
    }, [gl])

    const state = useMemo(
      () => ({
        composer,
        normalPass,
        downSamplingPass: null,
        camera,
        scene
      }),
      [composer, normalPass, camera, scene]
    )

    useImperativeHandle(forwardedRef, () => composer, [composer])

    return (
      <EffectComposerContext.Provider value={state}>
        <group ref={group}>{children}</group>
      </EffectComposerContext.Provider>
    )
  })
)
