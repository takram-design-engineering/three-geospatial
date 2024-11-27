import { applyProps, useThree } from '@react-three/fiber'
import { N8AOPostPass } from 'n8ao'
import { type Effect } from 'postprocessing'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color } from 'three'

export interface SSAOProps {
  aoSamples?: number
  aoRadius?: number
  aoTones?: number
  denoiseSamples?: number
  denoiseRadius?: number
  distanceFalloff?: number
  intensity?: number
  denoiseIterations?: number
  renderMode?: number
  biasOffset?: number
  biasMultiplier?: number
  color?: Color
  gammaCorrection?: boolean
  logarithmicDepthBuffer?: boolean
  screenSpaceRadius?: boolean
  halfRes?: boolean
  depthAwareUpsampling?: boolean
  colorMultiply?: boolean
  transparencyAware?: boolean
  accumulate?: boolean
}

export const SSAO = /*#__PURE__*/ forwardRef<Effect, SSAOProps>(function SSAO(
  {
    aoSamples = 16,
    aoRadius = 5,
    aoTones = 0,
    denoiseSamples = 8,
    denoiseRadius = 12,
    distanceFalloff = 1,
    intensity = 1, // Changed
    denoiseIterations = 2,
    renderMode = 0,
    biasOffset = 0,
    biasMultiplier = 0,
    color = new Color(0, 0, 0),
    gammaCorrection = false, // Changed
    logarithmicDepthBuffer = false,
    screenSpaceRadius = false,
    halfRes = false,
    depthAwareUpsampling = true,
    colorMultiply = true,
    transparencyAware = false,
    accumulate = false
  },
  forwardedRef
) {
  const { camera, scene, size } = useThree()
  const effect = useMemo(
    () => new N8AOPostPass(scene, camera, size.width, size.height),
    // TODO: Change of scene and camera break the pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const effectRef = useRef(effect)
  effectRef.current = effect

  useLayoutEffect(() => {
    effectRef.current.setSize(size.width, size.height)
  }, [size.width, size.height])

  useLayoutEffect(() => {
    applyProps(effectRef.current.configuration, {
      aoSamples,
      aoRadius,
      aoTones,
      denoiseSamples,
      denoiseRadius,
      distanceFalloff,
      intensity,
      denoiseIterations,
      renderMode,
      biasOffset,
      biasMultiplier,
      color,
      gammaCorrection,
      logarithmicDepthBuffer,
      screenSpaceRadius,
      halfRes,
      depthAwareUpsampling,
      colorMultiply,
      transparencyAware,
      accumulate
    })
  }, [
    aoSamples,
    aoRadius,
    aoTones,
    denoiseSamples,
    denoiseRadius,
    distanceFalloff,
    intensity,
    denoiseIterations,
    renderMode,
    biasOffset,
    biasMultiplier,
    color,
    gammaCorrection,
    logarithmicDepthBuffer,
    screenSpaceRadius,
    halfRes,
    depthAwareUpsampling,
    colorMultiply,
    transparencyAware,
    accumulate
  ])

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive ref={forwardedRef} object={effect} />
})
