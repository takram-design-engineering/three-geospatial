import { useFrame, useThree, type ElementProps } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useCallback, useContext, useEffect, useMemo, type FC } from 'react'
import {
  Data3DTexture,
  LinearFilter,
  LinearMipMapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  TextureLoader,
  type Texture,
  type WebGLRenderer
} from 'three'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'
import {
  DataTextureLoader,
  DEFAULT_STBN_URL,
  parseUint8Array,
  STBNLoader
} from '@takram/three-geospatial'
import type { ExpandNestedProps } from '@takram/three-geospatial/r3f'

import {
  CloudsEffect,
  cloudsPassOptionsDefaults,
  type CloudsEffectChangeEvent
} from '../CloudsEffect'
import {
  CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
  CLOUD_SHAPE_TEXTURE_SIZE,
  DEFAULT_LOCAL_WEATHER_URL,
  DEFAULT_SHAPE_DETAIL_URL,
  DEFAULT_SHAPE_URL,
  DEFAULT_TURBULENCE_URL
} from '../constants'
import type { Procedural3DTexture } from '../Procedural3DTexture'
import type { ProceduralTexture } from '../ProceduralTexture'
import { CloudLayers } from './CloudLayers'

function useLoadTexture(
  input: string | Texture | ProceduralTexture,
  gl: WebGLRenderer
): Texture | ProceduralTexture | null {
  const loadedTexture = useMemo(
    () =>
      typeof input === 'string'
        ? new TextureLoader().load(input, texture => {
            texture.minFilter = LinearMipMapLinearFilter
            texture.magFilter = LinearFilter
            texture.wrapS = RepeatWrapping
            texture.wrapT = RepeatWrapping
            texture.colorSpace = NoColorSpace
            texture.needsUpdate = true
          })
        : undefined,
    [input]
  )
  useEffect(() => {
    if (loadedTexture != null) {
      return () => {
        loadedTexture.dispose()
      }
    }
  }, [loadedTexture])
  return (typeof input === 'string' ? loadedTexture : input) ?? null
}

function useLoad3DTexture(
  input: string | Data3DTexture | Procedural3DTexture,
  size: number
): Data3DTexture | Procedural3DTexture | null {
  const loadedTexture = useMemo(
    () =>
      typeof input === 'string'
        ? new DataTextureLoader(Data3DTexture, parseUint8Array, {
            width: size,
            height: size,
            depth: size,
            format: RedFormat,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            wrapS: RepeatWrapping,
            wrapT: RepeatWrapping,
            wrapR: RepeatWrapping,
            colorSpace: NoColorSpace
          }).load(input)
        : undefined,
    [input, size]
  )
  useEffect(() => {
    if (loadedTexture != null) {
      return () => {
        loadedTexture.dispose()
      }
    }
  }, [loadedTexture])
  return (typeof input === 'string' ? loadedTexture : input) ?? null
}

function useLoadSTBNTexture(
  input: string | Data3DTexture
): Data3DTexture | null {
  const loadedTexture = useMemo(
    () =>
      typeof input === 'string' ? new STBNLoader().load(input) : undefined,
    [input]
  )
  useEffect(() => {
    if (loadedTexture != null) {
      return () => {
        loadedTexture.dispose()
      }
    }
  }, [loadedTexture])
  return (typeof input === 'string' ? loadedTexture : input) ?? null
}

export interface CloudsProps
  extends Omit<
    ElementProps<
      typeof CloudsEffect,
      CloudsEffect &
        ExpandNestedProps<CloudsEffect, 'clouds'> &
        ExpandNestedProps<CloudsEffect, 'shadow'>
    >,
    | 'localWeatherTexture'
    | 'shapeTexture'
    | 'shapeDetailTexture'
    | 'turbulenceTexture'
    | 'stbnTexture'
  > {
  disableDefaultLayers?: boolean
  localWeatherTexture?: Texture | ProceduralTexture | string
  shapeTexture?: Data3DTexture | Procedural3DTexture | string
  shapeDetailTexture?: Data3DTexture | Procedural3DTexture | string
  turbulenceTexture?: Texture | ProceduralTexture | string
  stbnTexture?: Data3DTexture | string
}

export const Clouds: FC<CloudsProps> = ({
  ref: forwardedRef,
  disableDefaultLayers = false,
  localWeatherTexture: localWeatherTextureProp = DEFAULT_LOCAL_WEATHER_URL,
  shapeTexture: shapeTextureProp = DEFAULT_SHAPE_URL,
  shapeDetailTexture: shapeDetailTextureProp = DEFAULT_SHAPE_DETAIL_URL,
  turbulenceTexture: turbulenceTextureProp = DEFAULT_TURBULENCE_URL,
  stbnTexture: stbnTextureProp = DEFAULT_STBN_URL,
  children,
  ...props
}) => {
  const { textures, transientStates, ...contextProps } =
    useContext(AtmosphereContext)

  const [atmosphereParameters, others] = separateProps({
    ...cloudsPassOptionsDefaults,
    ...contextProps,
    ...textures,
    ...props
  })

  const effect = useMemo(() => new CloudsEffect(), [])
  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  useFrame(() => {
    if (transientStates != null) {
      effect.sunDirection.copy(transientStates.sunDirection)
      effect.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)
    }
  })

  useEffect(() => {
    if (transientStates != null) {
      transientStates.overlay = effect.atmosphereOverlay
      transientStates.shadow = effect.atmosphereShadow
      transientStates.shadowLength = effect.atmosphereShadowLength
      return () => {
        transientStates.overlay = null
        transientStates.shadow = null
        transientStates.shadowLength = null
      }
    }
  }, [effect, transientStates])

  const handleChange = useCallback(
    (event: CloudsEffectChangeEvent) => {
      if (transientStates == null) {
        return
      }
      switch (event.property) {
        case 'atmosphereOverlay':
          transientStates.overlay = effect.atmosphereOverlay
          break
        case 'atmosphereShadow':
          transientStates.shadow = effect.atmosphereShadow
          break
        case 'atmosphereShadowLength':
          transientStates.shadowLength = effect.atmosphereShadowLength
          break
        default:
      }
    },
    [effect, transientStates]
  )
  useEffect(() => {
    effect.events.addEventListener('change', handleChange)
    return () => {
      effect.events.removeEventListener('change', handleChange)
    }
  }, [effect, handleChange])

  const renderer = useThree(({ gl }) => gl)
  const localWeatherTexture = useLoadTexture(localWeatherTextureProp, renderer)
  const shapeTexture = useLoad3DTexture(
    shapeTextureProp,
    CLOUD_SHAPE_TEXTURE_SIZE
  )
  const shapeDetailTexture = useLoad3DTexture(
    shapeDetailTextureProp,
    CLOUD_SHAPE_DETAIL_TEXTURE_SIZE
  )
  const turbulenceTexture = useLoadTexture(turbulenceTextureProp, renderer)
  const stbnTexture = useLoadSTBNTexture(stbnTextureProp)

  const { camera } = useContext(EffectComposerContext)
  return (
    <>
      <primitive
        ref={forwardedRef}
        object={effect}
        mainCamera={camera}
        {...atmosphereParameters}
        localWeatherTexture={localWeatherTexture}
        shapeTexture={shapeTexture}
        shapeDetailTexture={shapeDetailTexture}
        turbulenceTexture={turbulenceTexture}
        stbnTexture={stbnTexture}
        {...others}
      />
      <CloudLayers
        layers={effect.cloudLayers}
        disableDefault={disableDefaultLayers}
      >
        {children}
      </CloudLayers>
    </>
  )
}
