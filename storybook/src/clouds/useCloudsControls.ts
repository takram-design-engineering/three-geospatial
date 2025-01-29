import { useFrame } from '@react-three/fiber'
import { folder } from 'leva'
import { useEffect } from 'react'

import { type CloudLayer, type CloudsEffect } from '@takram/three-clouds'
import { type CloudsProps } from '@takram/three-clouds/r3f'

import { useControls } from '../helpers/useControls'

type FlattenCloudLayer<Index extends number> = {
  [K in keyof CloudLayer as `${K}${Index}`]: CloudLayer[K]
}

type FlatCloudLayers = FlattenCloudLayer<0> &
  FlattenCloudLayer<1> &
  FlattenCloudLayer<2> &
  FlattenCloudLayer<3>

export interface CloudsControlParams {
  enabled: boolean
  debugShowShadowMap: boolean
  debugShowUv: boolean
  debugShowShadowLength: boolean
}

export function useCloudsControls(
  effect: CloudsEffect | null,
  {
    coverage: defaultCoverage,
    animate: defaultAnimate,
    localWeatherVelocity: defaultLocalWeatherVelocity
  }: {
    coverage?: number
    animate?: boolean
    localWeatherVelocity?: number
  } = {}
): [CloudsControlParams, Partial<CloudsProps>] {
  const { enabled, coverage, animate, shapeDetail, crepuscularRays } =
    useControls('clouds', {
      enabled: true,
      coverage: { value: defaultCoverage ?? 0.3, min: 0, max: 1, step: 0.01 },
      animate: defaultAnimate ?? false,
      shapeDetail: true,
      crepuscularRays: true
    })

  useEffect(() => {
    if (effect == null) {
      return
    }
    effect.cloudsPass.currentMaterial.shapeDetail = shapeDetail
  }, [effect, shapeDetail])

  const { temporalUpscale, resolutionScale } = useControls(
    'clouds rendering',
    {
      temporalUpscale: true,
      resolutionScale: { value: 1, options: [0.25, 0.5, 0.75, 1] }
    },
    { collapsed: true }
  )

  const {
    mapSize: shadowMapSize,
    temporalPass: shadowTemporalPass,
    temporalJitter: shadowTemporalJitter
  } = useControls(
    'shadow rendering',
    {
      mapSize: { value: 512, options: [256, 512, 1024] },
      temporalPass: true,
      temporalJitter: true
    },
    { collapsed: true }
  )

  useEffect(() => {
    if (effect != null) {
      effect.shadowPass.temporalPass = shadowTemporalPass
      effect.shadowPass.currentMaterial.temporalJitter = shadowTemporalJitter
    }
  }, [effect, shadowTemporalPass, shadowTemporalJitter])

  const scatteringParams = useControls(
    'scattering',
    {
      scatteringCoefficient: { value: 1, min: 0, max: 5 },
      absorptionCoefficient: { value: 0.02, min: 0, max: 5 },
      scatterAnisotropy1: { value: 0.7, min: 0, max: 1 },
      scatterAnisotropy2: { value: -0.2, min: -1, max: 0 },
      scatterAnisotropyMix: { value: 0.5, min: 0, max: 1 },
      skyIrradianceScale: { value: 2, min: 0, max: 5 },
      groundIrradianceScale: { value: 3, min: 0, max: 10 },
      powderScale: { value: 0.8, min: 0, max: 1 },
      powderExponent: { value: 150, min: 1, max: 1000 },
      shadowExtensionScale: { value: 2, min: 1, max: 5 }
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

  const cloudLayersParams = useControls(
    'cloud layers',
    effect?.cloudLayers.reduce(
      (schema, layer, index) => ({
        ...schema,
        [`layer ${index}`]: folder(
          {
            [`altitude ${index}`]: {
              value: layer.altitude,
              min: 0,
              max: 10000
            },
            [`height ${index}`]: {
              value: layer.height,
              min: 0,
              max: 2000
            },
            [`densityScale ${index}`]: {
              value: layer.densityScale,
              min: 0,
              max: 1
            },
            [`shapeAmount ${index}`]: {
              value: layer.shapeAmount,
              min: 0,
              max: 1
            },
            [`detailAmount ${index}`]: {
              value: layer.detailAmount,
              min: 0,
              max: 1
            },
            [`weatherExponent ${index}`]: {
              value: layer.weatherExponent,
              min: 0,
              max: 3
            },
            [`shapeAlteringBias ${index}`]: {
              value: layer.shapeAlteringBias,
              min: 0,
              max: 1
            },
            [`coverageFilterWidth ${index}`]: {
              value: layer.coverageFilterWidth,
              min: 0,
              max: 1
            },
            [`shadow ${index}`]: layer.shadow ?? false
          },
          { collapsed: index > 0 }
        )
      }),
      {}
    ) ?? {},
    { collapsed: true },
    [effect]
  ) as FlatCloudLayers

  useFrame(() => {
    if (effect == null) {
      return
    }
    for (const key in scatteringParams) {
      effect.cloudsPass.currentMaterial.uniforms[key].value =
        scatteringParams[key as keyof typeof scatteringParams]
    }
    for (const key in cloudsRaymarchParams) {
      effect.cloudsPass.currentMaterial.uniforms[key].value =
        cloudsRaymarchParams[key as keyof typeof cloudsRaymarchParams]
    }
    for (const key in shadowRaymarchParams) {
      effect.shadowPass.currentMaterial.uniforms[key].value =
        shadowRaymarchParams[key as keyof typeof shadowRaymarchParams]
    }
    for (const key in cloudLayersParams) {
      const field = key.slice(0, -2)
      const index = +key.slice(-1)
      ;(effect.cloudLayers as any)[index][field] =
        cloudLayersParams[key as keyof typeof cloudLayersParams]
    }
  })

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
      showUv: false,
      showShadowLength: false,
      showVelocity: false
    },
    { collapsed: true }
  )

  useEffect(() => {
    if (effect == null) {
      return
    }
    if (debugShowShadowMap) {
      effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_SHADOW_MAP = '1'
    } else {
      delete effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_SHADOW_MAP
    }
    if (debugShowCascades) {
      effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_CASCADES = '1'
    } else {
      delete effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_CASCADES
    }
    if (debugShowUv) {
      effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_UV = '1'
    } else {
      delete effect.cloudsPass.currentMaterial.defines.DEBUG_SHOW_UV
    }
    effect.cloudsPass.currentMaterial.needsUpdate = true
  }, [effect, debugShowShadowMap, debugShowCascades, debugShowUv])

  useEffect(() => {
    if (effect == null) {
      return
    }
    if (debugShowShadowLength) {
      effect.cloudsPass.resolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH = '1'
    } else {
      delete effect.cloudsPass.resolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH
    }
    if (debugShowVelocity) {
      effect.cloudsPass.resolveMaterial.defines.DEBUG_SHOW_VELOCITY = '1'
    } else {
      delete effect.cloudsPass.resolveMaterial.defines.DEBUG_SHOW_VELOCITY
    }
    effect.cloudsPass.resolveMaterial.needsUpdate = true
  }, [effect, debugShowShadowLength, debugShowVelocity])

  return [
    {
      enabled,
      debugShowShadowMap,
      debugShowUv,
      debugShowShadowLength
    },
    {
      coverage,
      temporalUpscale: temporalUpscale && !debugShowShadowMap,
      'resolution-scale': resolutionScale,
      localWeatherVelocity: animate
        ? [defaultLocalWeatherVelocity ?? 0.00001, 0]
        : [0, 0],
      'shadow-mapSize': [shadowMapSize, shadowMapSize],
      crepuscularRays
    }
  ]
}
