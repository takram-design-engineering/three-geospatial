import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { useSetAtom } from 'jotai'
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  LinearFilter,
  LinearMipMapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  TextureLoader,
  type Data3DTexture,
  type Texture,
  type WebGLRenderer
} from 'three'

import { AtmosphereContext, separateProps } from '@takram/three-atmosphere/r3f'
import {
  createData3DTextureLoaderClass,
  parseUint8Array
} from '@takram/three-geospatial'
import {
  type ExpandNestedProps,
  type PassThoughInstanceProps
} from '@takram/three-geospatial/r3f'

import {
  CloudsPass,
  cloudsPassOptionsDefaults,
  type CloudsPassChangeEvent
} from '../CloudsPass'
import {
  DEFAULT_LOCAL_WEATHER_URL,
  DEFAULT_SHAPE_DETAIL_URL,
  DEFAULT_SHAPE_URL,
  DEFAULT_TURBULENCE_URL
} from '../constants'
import { type Procedural3DTexture } from '../Procedural3DTexture'
import { type ProceduralTexture } from '../ProceduralTexture'
import { CloudLayers, type CloudLayersChildren } from './CloudLayers'

export type CloudsProps = Omit<
  PassThoughInstanceProps<
    CloudsPass,
    [],
    Partial<
      CloudsPass &
        ExpandNestedProps<CloudsPass, 'resolution'> &
        ExpandNestedProps<CloudsPass, 'shadow'>
    >
  >,
  | 'localWeatherTexture'
  | 'shapeTexture'
  | 'shapeDetailTexture'
  | 'turbulenceTexture'
  | 'children'
> & {
  children?: CloudLayersChildren
  localWeatherTexture?: Texture | ProceduralTexture | string
  shapeTexture?: Data3DTexture | Procedural3DTexture | string
  shapeDetailTexture?: Data3DTexture | Procedural3DTexture | string
  turbulenceTexture?: Texture | ProceduralTexture | string
}

function useTextureState(
  input: string | Texture | ProceduralTexture,
  gl: WebGLRenderer
): Texture | ProceduralTexture | null {
  const [data, setData] = useState(typeof input !== 'string' ? input : null)
  useEffect(() => {
    if (typeof input === 'string') {
      const loader = new TextureLoader()
      ;(async () => {
        const texture = await loader.loadAsync(input)
        texture.minFilter = LinearMipMapLinearFilter
        texture.magFilter = LinearFilter
        texture.wrapS = RepeatWrapping
        texture.wrapT = RepeatWrapping
        texture.colorSpace = NoColorSpace
        texture.needsUpdate = true

        // WORKAROUND: Unless the texture is initialized here, the color space
        // resets to sRGB for an unknown reason.
        gl.initTexture(texture)

        setData(texture)
      })().catch(error => {
        console.error(error)
      })
    } else {
      setData(input)
    }
  }, [input, gl])

  return data
}

function use3DTextureState(
  input: string | Data3DTexture | Procedural3DTexture,
  size: number
): Data3DTexture | Procedural3DTexture | null {
  const [data, setData] = useState(typeof input !== 'string' ? input : null)
  useEffect(() => {
    if (typeof input === 'string') {
      const Loader = createData3DTextureLoaderClass(parseUint8Array, {
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
      })
      const loader = new Loader()
      ;(async () => {
        setData(await loader.loadAsync(input))
      })().catch(error => {
        console.error(error)
      })
    } else {
      setData(input)
    }
  }, [input, size])

  return data
}

export const Clouds = /*#__PURE__*/ forwardRef<CloudsPass, CloudsProps>(
  function Clouds(
    {
      localWeatherTexture: localWeatherTextureProp = DEFAULT_LOCAL_WEATHER_URL,
      shapeTexture: shapeTextureProp = DEFAULT_SHAPE_URL,
      shapeDetailTexture: shapeDetailTextureProp = DEFAULT_SHAPE_DETAIL_URL,
      turbulenceTexture: turbulenceTextureProp = DEFAULT_TURBULENCE_URL,
      children,
      ...props
    },
    forwardedRef
  ) {
    const { textures, stbn, transientStates, atoms, ...contextProps } =
      useContext(AtmosphereContext)

    const [atmosphereParameters, others] = separateProps({
      ...cloudsPassOptionsDefaults,
      ...contextProps,
      ...textures,
      ...props
    })

    const pass = useMemo(() => new CloudsPass(), [])
    useEffect(() => {
      return () => {
        pass.dispose()
      }
    }, [pass])

    useFrame(() => {
      if (transientStates != null) {
        pass.sunDirection.copy(transientStates.sunDirection)
        pass.ellipsoidCenter.copy(transientStates.ellipsoidCenter)
        pass.ellipsoidMatrix.copy(transientStates.ellipsoidMatrix)
      }
    })

    const setOverlay = useSetAtom(atoms.overlayAtom)
    const setShadow = useSetAtom(atoms.shadowAtom)
    const setShadowLength = useSetAtom(atoms.shadowLengthAtom)

    useEffect(() => {
      setOverlay(pass.atmosphereOverlay)
      setShadow(pass.atmosphereShadow)
      setShadowLength(pass.atmosphereShadowLength)
    }, [pass, setOverlay, setShadow, setShadowLength])

    const handleChange = useCallback(
      (event: CloudsPassChangeEvent) => {
        switch (event.property) {
          case 'atmosphereOverlay':
            setOverlay(pass.atmosphereOverlay)
            break
          case 'atmosphereShadow':
            setShadow(pass.atmosphereShadow)
            break
          case 'atmosphereShadowLength':
            setShadowLength(pass.atmosphereShadowLength)
            break
        }
      },
      [pass, setOverlay, setShadow, setShadowLength]
    )
    useEffect(() => {
      pass.events.addEventListener('change', handleChange)
      return () => {
        pass.events.removeEventListener('change', handleChange)
      }
    }, [pass, handleChange])

    const gl = useThree(({ gl }) => gl)
    const localWeatherTexture = useTextureState(localWeatherTextureProp, gl)
    const shapeTexture = use3DTextureState(shapeTextureProp, 128)
    const shapeDetailTexture = use3DTextureState(shapeDetailTextureProp, 32)
    const turbulenceTexture = useTextureState(turbulenceTextureProp, gl)

    const { camera } = useContext(EffectComposerContext)
    return (
      <>
        <primitive
          ref={forwardedRef}
          object={pass}
          mainCamera={camera}
          {...atmosphereParameters}
          localWeatherTexture={localWeatherTexture}
          shapeTexture={shapeTexture}
          shapeDetailTexture={shapeDetailTexture}
          turbulenceTexture={turbulenceTexture}
          stbnTexture={stbn}
          {...others}
        />
        {children != null && <CloudLayers pass={pass}>{children}</CloudLayers>}
      </>
    )
  }
)
