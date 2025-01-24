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
  const { enabled, coverage, animate, shapeDetail, shadowLength } = useControls(
    'clouds',
    {
      enabled: true,
      coverage: { value: defaultCoverage ?? 0.3, min: 0, max: 1, step: 0.01 },
      animate: defaultAnimate ?? false,
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
    },
    { collapsed: true }
  )

  const scatteringParams = useControls(
    'scattering',
    {
      albedo: { value: 0.98, min: 0, max: 1 },
      scatterAnisotropy1: { value: 0.7, min: 0, max: 1 },
      scatterAnisotropy2: { value: -0.2, min: -1, max: 0 },
      scatterAnisotropyMix: { value: 0.5, min: 0, max: 1 },
      skyIrradianceScale: { value: 3, min: 0, max: 5 },
      groundIrradianceScale: { value: 3, min: 0, max: 10 },
      powderScale: { value: 0.8, min: 0, max: 1 },
      powderExponent: { value: 150, min: 1, max: 1000 },
      shadowExtension: { value: 1.5, min: 1, max: 3 }
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
            [`altitude${index}`]: {
              value: layer.altitude,
              min: 0,
              max: 10000
            },
            [`height${index}`]: {
              value: layer.height,
              min: 0,
              max: 2000
            },
            [`extinctionCoefficient${index}`]: {
              value: layer.extinctionCoefficient,
              min: 0,
              max: 1
            },
            [`detailAmount${index}`]: {
              value: layer.detailAmount,
              min: 0,
              max: 1
            },
            [`weatherExponent${index}`]: {
              value: layer.weatherExponent,
              min: 0,
              max: 3
            },
            [`shapeAlteringBias${index}`]: {
              value: layer.shapeAlteringBias,
              min: 0,
              max: 1
            },
            [`coverageFilterWidth${index}`]: {
              value: layer.coverageFilterWidth,
              min: 0,
              max: 1
            },
            [`shadow${index}`]: layer.shadow ?? false
          },
          { collapsed: index > 0 }
        )
      }),
      {}
    ) ?? {},
    { collapsed: true },
    [effect]
  ) as FlatCloudLayers

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

  useFrame(() => {
    if (effect == null) {
      return
    }
    const { albedo, ...scalarScatteringParams } = scatteringParams
    effect.cloudsMaterial.uniforms.albedo.value.setScalar(albedo)
    for (const key in scalarScatteringParams) {
      effect.cloudsMaterial.uniforms[key].value =
        scalarScatteringParams[key as keyof typeof scalarScatteringParams]
    }
    for (const key in cloudsRaymarchParams) {
      effect.cloudsMaterial.uniforms[key].value =
        cloudsRaymarchParams[key as keyof typeof cloudsRaymarchParams]
    }
    for (const key in shadowRaymarchParams) {
      effect.shadowMaterial.uniforms[key].value =
        shadowRaymarchParams[key as keyof typeof shadowRaymarchParams]
    }
    for (const key in cloudLayersParams) {
      const field = key.slice(0, -1)
      const index = +key.slice(-1)
      ;(effect.cloudLayers as any)[index][field] =
        cloudLayersParams[key as keyof typeof cloudLayersParams]
    }
  })

  useEffect(() => {
    if (effect == null) {
      return
    }
    effect.cloudsMaterial.useShapeDetail = shapeDetail
  }, [effect, shapeDetail])

  useEffect(() => {
    if (effect == null) {
      return
    }
    if (debugShowShadowMap) {
      effect.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP = '1'
    } else {
      delete effect.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP
    }
    if (debugShowCascades) {
      effect.cloudsMaterial.defines.DEBUG_SHOW_CASCADES = '1'
    } else {
      delete effect.cloudsMaterial.defines.DEBUG_SHOW_CASCADES
    }
    if (debugShowUv) {
      effect.cloudsMaterial.defines.DEBUG_SHOW_UV = '1'
    } else {
      delete effect.cloudsMaterial.defines.DEBUG_SHOW_UV
    }
    if (debugShowShadowLength) {
      effect.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH = '1'
    } else {
      delete effect.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH
    }
    if (debugShowVelocity) {
      effect.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY = '1'
    } else {
      delete effect.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY
    }
    effect.cloudsMaterial.needsUpdate = true
    effect.cloudsResolveMaterial.needsUpdate = true
  }, [
    effect,
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
      localWeatherVelocity: animate
        ? [defaultLocalWeatherVelocity ?? 0.00005, 0]
        : [0, 0],
      'shadow-mapSize': [shadowMapSize, shadowMapSize],
      shadowLength
    }
  ]
}
