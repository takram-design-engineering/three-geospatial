import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'

import { type CloudsEffect } from '@takram/three-clouds'
import { type CloudsProps } from '@takram/three-clouds/r3f'

import { useControls } from '../helpers/useControls'

export interface CloudsControlParams {
  enabled: boolean
  debugShowShadowMap: boolean
  debugShowUv: boolean
  debugShowShadowLength: boolean
}

export function useCloudsControls(
  clouds: CloudsEffect | null
): [CloudsControlParams, Partial<CloudsProps>] {
  const { enabled, coverage, animate, shapeDetail, shadowLength } = useControls(
    'clouds',
    {
      enabled: true,
      coverage: { value: 0.35, min: 0, max: 1, step: 0.01 },
      animate: false,
      shapeDetail: true,
      shadowLength: true
    }
  )

  const { temporalUpscaling, halfResolution, shadowMapSize } = useControls(
    'rendering',
    {
      temporalUpscaling: true,
      halfResolution: false,
      shadowMapSize: { value: 512, options: [256, 512, 1024] }
    }
  )

  const scatteringParams = useControls(
    'scattering',
    {
      albedo: { value: 0.98, min: 0, max: 1 },
      scatterAnisotropy1: { value: 0.7, min: 0, max: 1 },
      scatterAnisotropy2: { value: -0.2, min: -1, max: 0 },
      scatterAnisotropyMix: { value: 0.5, min: 0, max: 1 },
      skyIrradianceScale: { value: 0.95, min: 0, max: 1 },
      groundIrradianceScale: { value: 0.5, min: 0, max: 1 },
      powderScale: { value: 0.8, min: 0.5, max: 1 },
      powderExponent: { value: 100, min: 1, max: 1000 },
      shadowExtension: { value: 3, min: 1, max: 10 }
    },
    { collapsed: true }
  )

  const cloudsRaymarchParams = useControls(
    'clouds raymarch',
    {
      maxIterations: { value: 500, min: 100, max: 1000 },
      minStepSize: { value: 50, min: 50, max: 200 },
      maxStepSize: { value: 1000, min: 200, max: 2000 }
    },
    { collapsed: true }
  )

  const shadowRaymarchParams = useControls(
    'shadow raymarch',
    {
      maxIterations: { value: 50, min: 10, max: 100 },
      minStepSize: { value: 100, min: 50, max: 200 },
      maxStepSize: { value: 1000, min: 200, max: 2000 }
    },
    { collapsed: true }
  )

  const {
    showShadowMap: debugShowShadowMap,
    showCascades: debugShowCascades,
    showUv: debugShowUv,
    showShadowLength: debugShowShadowLength,
    showVelocity: debugShowVelocity
  } = useControls(
    'debug',
    {
      showShadowMap: false,
      showCascades: false,
      showBox: false,
      showUv: false,
      showShadowLength: false,
      showVelocity: false
    },
    { collapsed: true }
  )

  useFrame(() => {
    if (clouds == null) {
      return
    }
    const { albedo, ...scalarScatteringParams } = scatteringParams
    clouds.cloudsMaterial.uniforms.albedo.value.setScalar(albedo)
    for (const key in scalarScatteringParams) {
      clouds.cloudsMaterial.uniforms[key].value =
        scalarScatteringParams[key as keyof typeof scalarScatteringParams]
    }
    for (const key in cloudsRaymarchParams) {
      clouds.cloudsMaterial.uniforms[key].value =
        cloudsRaymarchParams[key as keyof typeof cloudsRaymarchParams]
    }
    for (const key in shadowRaymarchParams) {
      clouds.shadowMaterial.uniforms[key].value =
        shadowRaymarchParams[key as keyof typeof shadowRaymarchParams]
    }
  })

  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.useShapeDetail = shapeDetail
  }, [clouds, shapeDetail])

  useEffect(() => {
    if (clouds == null) {
      return
    }
    if (debugShowShadowMap) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP
    }
    if (debugShowCascades) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_CASCADES = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_CASCADES
    }
    if (debugShowUv) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_UV = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_UV
    }
    if (debugShowShadowLength) {
      clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH = '1'
    } else {
      delete clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH
    }
    if (debugShowVelocity) {
      clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY = '1'
    } else {
      delete clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY
    }
    clouds.cloudsMaterial.needsUpdate = true
    clouds.cloudsResolveMaterial.needsUpdate = true
  }, [
    clouds,
    debugShowShadowMap,
    debugShowCascades,
    debugShowUv,
    debugShowShadowLength,
    debugShowVelocity
  ])

  return [
    {
      enabled,
      debugShowShadowMap,
      debugShowUv,
      debugShowShadowLength
    },
    {
      coverage,
      temporalUpscaling,
      'resolution-scale': halfResolution ? 0.5 : 1,
      localWeatherVelocity: animate ? [0.00005, 0] : [0, 0],
      'shadow-mapSize': [shadowMapSize, shadowMapSize],
      shadowLength
    }
  ]
}
