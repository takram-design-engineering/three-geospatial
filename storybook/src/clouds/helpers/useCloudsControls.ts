import { folder } from 'leva'
import type { FolderInput, Schema } from 'leva/dist/declarations/src/types'
import { useEffect, useMemo, useRef } from 'react'
import type { Material } from 'three'
import type { PartialDeep } from 'type-fest'

import {
  CloudLayer,
  type CloudLayerLike,
  type CloudsEffect,
  type CloudsQualityPreset,
  type DensityProfileLike,
  type FrustumSplitMode
} from '@takram/three-clouds'
import type { CloudsProps } from '@takram/three-clouds/r3f'

import { useControls } from '../../helpers/useControls'

function useRenderingControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'rendering',
    () => ({
      resolutionScale: { value: 1, options: [0.5, 0.75, 1] },
      temporalUpscale: false,
      lightShafts: false,
      shapeDetail: false,
      turbulence: false,
      haze: false
    }),
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    if (effect == null) {
      return
    }
    set({
      resolutionScale: effect.resolutionScale,
      temporalUpscale: effect.temporalUpscale,
      lightShafts: effect.lightShafts,
      shapeDetail: effect.shapeDetail,
      turbulence: effect.turbulence,
      haze: effect.haze
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return params
}

function useScatteringControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'scattering',
    () => ({
      scatteringCoefficient: { value: 0, min: 0, max: 5 },
      absorptionCoefficient: { value: 0, min: 0, max: 5 },
      scatterAnisotropy1: { value: 0, min: 0, max: 1 },
      scatterAnisotropy2: { value: 0, min: -1, max: 0 },
      scatterAnisotropyMix: { value: 0, min: 0, max: 1 },
      skyLightScale: { value: 0, min: 0, max: 5 },
      groundBounceScale: { value: 0, min: 0, max: 10 },
      powderScale: { value: 0, min: 0, max: 1 },
      powderExponent: { value: 0, min: 1, max: 1000 }
    }),
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    if (effect == null) {
      return
    }
    set({
      scatteringCoefficient: effect.scatteringCoefficient,
      absorptionCoefficient: effect.absorptionCoefficient,
      scatterAnisotropy1: effect.scatterAnisotropy1,
      scatterAnisotropy2: effect.scatterAnisotropy2,
      scatterAnisotropyMix: effect.scatterAnisotropyMix,
      skyLightScale: effect.skyLightScale,
      groundBounceScale: effect.groundBounceScale,
      powderScale: effect.powderScale,
      powderExponent: effect.powderExponent
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return params
}

function useWeatherAndShapeControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'weather and shape',
    () => ({
      localWeatherRepeat: { value: 0, min: 1, max: 200, step: 1 },
      localWeatherOffset: {
        value: { x: 0, y: 0 },
        min: 0,
        max: 1
      },
      'shapeRepeat-1e4': { value: 0, min: 1, max: 10 },
      shapeOffset: {
        value: { x: 0, y: 0, z: 0 },
        min: 0,
        max: 1
      },
      'shapeDetailRepeat-1e3': { value: 0, min: 1, max: 10 },
      shapeDetailOffset: {
        value: { x: 0, y: 0, z: 0 },
        min: 0,
        max: 1
      },
      turbulenceRepeat: { value: 0, min: 1, max: 50, step: 1 },
      turbulenceDisplacement: { value: 0, min: 1, max: 1000 }
    }),
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    if (effect == null) {
      return
    }
    set({
      localWeatherRepeat: effect.localWeatherRepeat.x,
      localWeatherOffset: {
        x: effect.localWeatherOffset.x,
        y: effect.localWeatherOffset.y
      },
      'shapeRepeat-1e4': effect.shapeRepeat.x * 1e4,
      shapeOffset: {
        x: effect.shapeOffset.x,
        y: effect.shapeOffset.y,
        z: effect.shapeOffset.z
      },
      'shapeDetailRepeat-1e3': effect.shapeDetailRepeat.x * 1e3,
      shapeDetailOffset: {
        x: effect.shapeDetailOffset.x,
        y: effect.shapeDetailOffset.y,
        z: effect.shapeDetailOffset.z
      },
      turbulenceRepeat: effect.turbulenceRepeat.x,
      turbulenceDisplacement: effect.turbulenceDisplacement
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return {
    localWeatherRepeat: params.localWeatherRepeat,
    localWeatherOffset: [
      params.localWeatherOffset.x,
      params.localWeatherOffset.y
    ],
    shapeRepeat: params['shapeRepeat-1e4'] * 1e-4,
    shapeOffset: [
      params.shapeOffset.x,
      params.shapeOffset.y,
      params.shapeOffset.z
    ],
    shapeDetailRepeat: params['shapeDetailRepeat-1e3'] * 1e-3,
    shapeDetailOffset: [
      params.shapeDetailOffset.x,
      params.shapeDetailOffset.y,
      params.shapeDetailOffset.z
    ],
    turbulenceRepeat: params.turbulenceRepeat,
    turbulenceDisplacement: params.turbulenceDisplacement
  }
}

function useCascadedShadowMapsControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'cascaded shadow maps',
    () => ({
      cascadeCount: { value: 1, options: [1, 2, 3, 4] },
      mapSize: { value: 256, options: [256, 512, 1024] },
      splitMode: {
        value: 'practical' as const,
        options: [
          'practical',
          'uniform',
          'logarithmic'
        ] satisfies FrustumSplitMode[]
      },
      splitLambda: { value: 0, min: 0, max: 1 }
    }),
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    const shadow = effect?.shadow
    if (shadow == null) {
      return
    }
    set({
      cascadeCount: shadow.cascadeCount,
      mapSize: shadow.mapSize.x,
      splitMode: shadow.splitMode,
      splitLambda: shadow.splitLambda
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return {
    'shadow-cascadeCount': params.cascadeCount,
    'shadow-mapSize': params.mapSize,
    'shadow-splitMode': params.splitMode,
    'shadow-splitLambda': params.splitLambda
  }
}

function useAdvancedCloudsControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'advanced clouds',
    () =>
      ({
        multiScatteringOctaves: { value: 0, min: 1, max: 12, step: 1 },
        accurateSunSkyLight: false,
        accuratePhaseFunction: false,
        maxIterationCount: { value: 0, min: 10, max: 1000, step: 1 },
        minStepSize: { value: 0, min: 10, max: 200, step: 1 },
        maxStepSize: { value: 0, min: 200, max: 2000, step: 1 },
        maxRayDistance: { value: 0, min: 1e4, max: 1e6 },
        perspectiveStepScale: { value: 0, min: 1, max: 1.1 },
        'minDensity-log10': { value: 0, min: -7, max: -1 },
        'minExtinction-log10': { value: 0, min: -7, max: -1 },
        'minTransmittance-log10': { value: 0, min: -7, max: -1 },
        maxIterationCountToSun: { value: 0, min: 0, max: 10, step: 1 },
        maxIterationCountToGround: { value: 0, min: 0, max: 10, step: 1 },
        maxShadowLengthIterationCount: {
          value: 0,
          min: 10,
          max: 1000,
          step: 1
        },
        minShadowLengthStepSize: { value: 0, min: 50, max: 200, step: 1 },
        maxShadowLengthRayDistance: { value: 0, min: 1e4, max: 1e6 },
        'hazeDensityScale-log10': { value: 0, min: -6, max: -3 },
        'hazeExponent-log10': { value: 0, min: -3, max: -1 },
        hazeScatteringCoefficient: { value: 0, min: 0, max: 5 },
        hazeAbsorptionCoefficient: { value: 0, min: 0, max: 5 }
      }) satisfies Partial<
        Record<
          | keyof CloudsEffect['clouds']
          | `${keyof CloudsEffect['clouds']}-log10`,
          Schema[string]
        >
      >,
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    const clouds = effect?.clouds
    if (clouds == null) {
      return
    }
    set({
      multiScatteringOctaves: clouds.multiScatteringOctaves,
      accurateSunSkyLight: clouds.accurateSunSkyLight,
      accuratePhaseFunction: clouds.accuratePhaseFunction,
      maxIterationCount: clouds.maxIterationCount,
      minStepSize: clouds.minStepSize,
      maxStepSize: clouds.maxStepSize,
      maxRayDistance: clouds.maxRayDistance,
      perspectiveStepScale: clouds.perspectiveStepScale,
      'minDensity-log10': Math.log10(clouds.minDensity),
      'minExtinction-log10': Math.log10(clouds.minExtinction),
      'minTransmittance-log10': Math.log10(clouds.minTransmittance),
      maxIterationCountToSun: clouds.maxIterationCountToSun,
      maxIterationCountToGround: clouds.maxIterationCountToGround,
      maxShadowLengthIterationCount: clouds.maxShadowLengthIterationCount,
      minShadowLengthStepSize: clouds.minShadowLengthStepSize,
      maxShadowLengthRayDistance: clouds.maxShadowLengthRayDistance,
      'hazeDensityScale-log10': Math.log10(clouds.hazeDensityScale),
      'hazeExponent-log10': Math.log10(clouds.hazeExponent),
      hazeScatteringCoefficient: clouds.hazeScatteringCoefficient,
      hazeAbsorptionCoefficient: clouds.hazeAbsorptionCoefficient
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return {
    'clouds-multiScatteringOctaves': params.multiScatteringOctaves,
    'clouds-accurateSunSkyLight': params.accurateSunSkyLight,
    'clouds-accuratePhaseFunction': params.accuratePhaseFunction,
    'clouds-maxIterationCount': params.maxIterationCount,
    'clouds-minStepSize': params.minStepSize,
    'clouds-maxStepSize': params.maxStepSize,
    'clouds-maxRayDistance': params.maxRayDistance,
    'clouds-perspectiveStepScale': params.perspectiveStepScale,
    'clouds-minDensity': 10 ** params['minDensity-log10'],
    'clouds-minExtinction': 10 ** params['minExtinction-log10'],
    'clouds-minTransmittance': 10 ** params['minTransmittance-log10'],
    'clouds-maxIterationCountToSun': params.maxIterationCountToSun,
    'clouds-maxIterationCountToGround': params.maxIterationCountToGround,
    'clouds-maxShadowLengthIterationCount':
      params.maxShadowLengthIterationCount,
    'clouds-minShadowLengthStepSize': params.minShadowLengthStepSize,
    'clouds-maxShadowLengthRayDistance': params.maxShadowLengthRayDistance,
    'clouds-hazeDensityScale': 10 ** params['hazeDensityScale-log10'],
    'clouds-hazeExponent': 10 ** params['hazeExponent-log10'],
    'clouds-hazeScatteringCoefficient': params.hazeScatteringCoefficient,
    'clouds-hazeAbsorptionCoefficient': params.hazeAbsorptionCoefficient
  }
}

function useAdvancedShadowControls(
  effect: CloudsEffect | null,
  qualityPreset: CloudsQualityPreset
): CloudsProps {
  const [params, set] = useControls(
    'advanced shadow',
    () =>
      ({
        temporalPass: false,
        temporalJitter: false,
        maxIterationCount: { value: 50, min: 10, max: 100, step: 1 },
        minStepSize: { value: 0, min: 10, max: 200, step: 1 },
        maxStepSize: { value: 0, min: 200, max: 2000, step: 1 },
        'minDensity-log10': { value: 0, min: -7, max: -1 },
        'minExtinction-log10': { value: 0, min: -7, max: -1 },
        'minTransmittance-log10': { value: 0, min: -7, max: -1 },
        opticalDepthTailScale: { value: 0, min: 0, max: 4 }
      }) satisfies Partial<
        Record<
          | keyof CloudsEffect['shadow']
          | `${keyof CloudsEffect['shadow']}-log10`,
          Schema[string]
        >
      >,
    { collapsed: true }
  )

  const initRef = useRef(false)
  useEffect(() => {
    const shadow = effect?.shadow
    if (shadow == null) {
      return
    }
    set({
      temporalPass: shadow.temporalPass,
      temporalJitter: shadow.temporalJitter,
      maxIterationCount: shadow.maxIterationCount,
      minStepSize: shadow.minStepSize,
      maxStepSize: shadow.maxStepSize,
      'minDensity-log10': Math.log10(shadow.minDensity),
      'minExtinction-log10': Math.log10(shadow.minExtinction),
      'minTransmittance-log10': Math.log10(shadow.minTransmittance),
      opticalDepthTailScale: shadow.opticalDepthTailScale
    })
    initRef.current = true
  }, [effect, qualityPreset, set])

  if (!initRef.current) {
    return {}
  }
  return {
    'shadow-temporalPass': params.temporalPass,
    'shadow-temporalJitter': params.temporalJitter,
    'shadow-maxIterationCount': params.maxIterationCount,
    'shadow-minStepSize': params.minStepSize,
    'shadow-maxStepSize': params.maxStepSize,
    'shadow-minDensity': 10 ** params['minDensity-log10'],
    'shadow-minExtinction': 10 ** params['minExtinction-log10'],
    'shadow-minTransmittance': 10 ** params['minTransmittance-log10'],
    'shadow-opticalDepthTailScale': params.opticalDepthTailScale
  }
}

type CloudLayerSchema = PartialDeep<{
  [K in keyof CloudLayerLike as `${K} ${1 | 2 | 3 | 4}`]: CloudLayerLike[K]
}>

function useCloudLayerControls(
  effect: CloudsEffect | null,
  layerIndex: number,
  disabled = false
): void {
  const schema = useMemo((): CloudLayerSchema => {
    const layer = effect?.cloudLayers[layerIndex]
    const params = {
      ...CloudLayer.DEFAULT,
      ...layer,
      densityProfile: {
        ...CloudLayer.DEFAULT.densityProfile,
        ...layer?.densityProfile
      }
    }
    return {
      [`layer ${layerIndex}`]: folder(
        {
          channel: {
            value: params.channel,
            options: ['r', 'g', 'b', 'a'] as const
          },
          altitude: {
            value: params.altitude,
            min: 0,
            max: 10000
          },
          height: {
            value: params.height,
            min: 0,
            max: 4000
          },
          densityScale: {
            value: params.densityScale,
            min: 0,
            max: 1
          },
          shapeAmount: {
            value: params.shapeAmount,
            min: 0,
            max: 1
          },
          shapeDetailAmount: {
            value: params.shapeDetailAmount,
            min: 0,
            max: 1
          },
          weatherExponent: {
            value: params.weatherExponent,
            min: 0,
            max: 3
          },
          shapeAlteringBias: {
            value: params.shapeAlteringBias,
            min: 0,
            max: 1
          },
          coverageFilterWidth: {
            value: params.coverageFilterWidth,
            min: 0,
            max: 1
          },
          shadow: {
            value: params.shadow
          },
          'density profile': folder(
            {
              expTerm: {
                value: params.densityProfile.expTerm,
                min: 0,
                max: 1
              },
              exponent: {
                value: params.densityProfile.exponent,
                min: -10,
                max: 10
              },
              linearTerm: {
                value: params.densityProfile.linearTerm,
                min: -2,
                max: 2
              },
              constantTerm: {
                value: params.densityProfile.constantTerm,
                min: -2,
                max: 2
              }
            },
            { collapsed: true }
          )
        } satisfies Partial<Record<keyof CloudLayerLike, Schema[string]>> & {
          'density profile': FolderInput<
            Record<keyof DensityProfileLike, Schema[string]>
          >
        },
        {
          collapsed: layerIndex > 0
        }
      )
    }
  }, [effect?.cloudLayers, layerIndex])

  const params: CloudLayerSchema = useControls(
    'cloud layers',
    effect != null && !disabled ? schema : {},
    { collapsed: true },
    [effect, disabled, schema]
  )

  useEffect(() => {
    if (effect == null || disabled) {
      return
    }
    for (const key in params) {
      if (Object.hasOwn(params, key)) {
        const layer = effect.cloudLayers[layerIndex] as any
        if (
          key === 'expTerm' ||
          key === 'exponent' ||
          key === 'linearTerm' ||
          key === 'constantTerm'
        ) {
          layer.densityProfile ??= {}
          layer.densityProfile[key] = params[key as keyof typeof params]
        } else {
          layer[key] = params[key as keyof typeof params]
        }
      }
    }
  }, [effect, layerIndex, disabled, params])
}

function useCloudLayersControls(
  effect: CloudsEffect | null,
  disabled = false
): void {
  useCloudLayerControls(effect, 0, disabled)
  useCloudLayerControls(effect, 1, disabled)
  useCloudLayerControls(effect, 2, disabled)
  useCloudLayerControls(effect, 3, disabled)
}

function setBooleanDefine(
  material: Material & { defines: Record<string, string> },
  key: string,
  value: boolean
): void {
  if (value) {
    material.defines[key] = '1'
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete material.defines[key]
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function useDebugCloudControls(effect: CloudsEffect | null) {
  const params = useControls(
    'debug',
    {
      showSampleCount: false,
      marchIntervals: false,
      showFrontDepth: false,
      showShadowMap: false,
      showCascades: false,
      showUv: false,
      showShadowLength: false,
      showVelocity: false
    },
    { collapsed: true }
  )

  const {
    showSampleCount,
    marchIntervals,
    showFrontDepth,
    showShadowMap,
    showCascades,
    showUv,
    showShadowLength,
    showVelocity
  } = params

  useEffect(() => {
    if (effect == null) {
      return
    }
    const material = effect.cloudsPass.currentMaterial
    setBooleanDefine(material, 'DEBUG_SHOW_SAMPLE_COUNT', showSampleCount)
    setBooleanDefine(material, 'DEBUG_MARCH_INTERVALS', marchIntervals)
    setBooleanDefine(material, 'DEBUG_SHOW_FRONT_DEPTH', showFrontDepth)
    setBooleanDefine(material, 'DEBUG_SHOW_SHADOW_MAP', showShadowMap)
    setBooleanDefine(material, 'DEBUG_SHOW_CASCADES', showCascades)
    setBooleanDefine(material, 'DEBUG_SHOW_UV', showUv)
    material.needsUpdate = true
  }, [
    effect,
    showSampleCount,
    marchIntervals,
    showFrontDepth,
    showShadowMap,
    showCascades,
    showUv
  ])

  useEffect(() => {
    if (effect == null) {
      return
    }
    const material = effect.shadowPass.currentMaterial
    setBooleanDefine(material, 'DEBUG_MARCH_INTERVALS', marchIntervals)
    material.needsUpdate = true
  }, [effect, marchIntervals])

  useEffect(() => {
    if (effect == null) {
      return
    }
    const material = effect.cloudsPass.resolveMaterial
    setBooleanDefine(material, 'DEBUG_SHOW_SHADOW_LENGTH', showShadowLength)
    setBooleanDefine(material, 'DEBUG_SHOW_VELOCITY', showVelocity)
    material.needsUpdate = true
  }, [effect, showShadowLength, showVelocity])

  return params
}

export interface CloudsControlOptions {
  coverage?: number
  animate?: boolean
  layerControls?: boolean
}

export interface CloudsControlValues {
  enabled: boolean
  toneMapping: boolean
}

export function useCloudsControls(
  effect: CloudsEffect | null,
  {
    coverage: defaultCoverage,
    animate: defaultAnimate,
    layerControls = true
  }: CloudsControlOptions = {}
): [CloudsControlValues, Partial<CloudsProps>] {
  const { enabled, coverage, animate, qualityPreset } = useControls('clouds', {
    enabled: true,
    coverage: { value: defaultCoverage ?? 0.3, min: 0, max: 1, step: 0.01 },
    animate: defaultAnimate ?? false,
    qualityPreset: {
      value: 'high' as const,
      options: [
        'low',
        'medium',
        'high',
        'ultra'
      ] satisfies CloudsQualityPreset[]
    }
  })

  const rendering = useRenderingControls(effect, qualityPreset)
  const scattering = useScatteringControls(effect, qualityPreset)
  const weatherAndShape = useWeatherAndShapeControls(effect, qualityPreset)
  const cascadedShadowMaps = useCascadedShadowMapsControls(
    effect,
    qualityPreset
  )
  const advancedClouds = useAdvancedCloudsControls(effect, qualityPreset)
  const advancedShadow = useAdvancedShadowControls(effect, qualityPreset)
  useCloudLayersControls(effect, !layerControls)

  const {
    showSampleCount,
    showFrontDepth,
    showShadowMap,
    showUv,
    showShadowLength
  } = useDebugCloudControls(effect)

  return [
    {
      enabled,
      toneMapping:
        !showSampleCount &&
        !showFrontDepth &&
        !showUv &&
        !showShadowMap &&
        !showShadowLength
    },
    {
      coverage,
      qualityPreset,
      ...rendering,
      ...scattering,
      ...weatherAndShape,
      ...cascadedShadowMaps,
      ...advancedClouds,
      ...advancedShadow,
      localWeatherVelocity: animate ? [0.001, 0] : [0, 0],
      ...(showShadowMap && { temporalUpscale: false })
    }
  ]
}
