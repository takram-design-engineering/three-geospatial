import { useThree } from '@react-three/fiber'
import { atom, type WritableAtom } from 'jotai'
import {
  createContext,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Matrix4, Vector3, type Data3DTexture, type Texture } from 'three'

import {
  DEFAULT_STBN_URL,
  Ellipsoid,
  STBNLoader
} from '@takram/three-geospatial'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '../celestialDirections'
import { DEFAULT_PRECOMPUTED_TEXTURES_URL } from '../constants'
import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'
import {
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from '../types'

export interface AtmosphereTransientProps {
  sunDirection: Vector3
  moonDirection: Vector3
  rotationMatrix: Matrix4
  ellipsoidCenter: Vector3
  ellipsoidMatrix: Matrix4
}

export interface AtmosphereAtoms {
  overlayAtom: WritableAtom<
    AtmosphereOverlay | null,
    [AtmosphereOverlay | null],
    void
  >
  shadowAtom: WritableAtom<
    AtmosphereShadow | null,
    [AtmosphereShadow | null],
    void
  >
  shadowLengthAtom: WritableAtom<
    AtmosphereShadowLength | null,
    [AtmosphereShadowLength | null],
    void
  >
}

export interface AtmosphereContextValue {
  textures?: PrecomputedTextures | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  stbn?: Data3DTexture | null
  transientStates?: AtmosphereTransientProps
  atoms: AtmosphereAtoms
}

export const AtmosphereContext = createContext<AtmosphereContextValue>({
  atoms: {
    overlayAtom: atom<AtmosphereOverlay | null>(null),
    shadowAtom: atom<AtmosphereShadow | null>(null),
    shadowLengthAtom: atom<AtmosphereShadowLength | null>(null)
  }
})

export interface AtmosphereProps {
  textures?: PrecomputedTextures | string
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  stbn?: Data3DTexture | string
  date?: number | Date
  children?: ReactNode
}

export interface AtmosphereApi extends AtmosphereTransientProps {
  textures?: PrecomputedTextures
  stbn?: Texture
  updateByDate: (date: number | Date) => void
}

export const Atmosphere = /*#__PURE__*/ forwardRef<
  AtmosphereApi,
  AtmosphereProps
>(function Atmosphere(
  {
    textures: texturesProp = DEFAULT_PRECOMPUTED_TEXTURES_URL,
    useHalfFloat,
    ellipsoid = Ellipsoid.WGS84,
    correctAltitude = true,
    photometric = true,
    stbn: stbnProp = DEFAULT_STBN_URL,
    date,
    children
  },
  forwardedRef
) {
  const transientStatesRef = useRef({
    sunDirection: new Vector3(),
    moonDirection: new Vector3(),
    rotationMatrix: new Matrix4(),
    ellipsoidCenter: new Vector3(),
    ellipsoidMatrix: new Matrix4()
  })

  const gl = useThree(({ gl }) => gl)
  if (useHalfFloat == null) {
    useHalfFloat =
      gl.getContext().getExtension('OES_texture_float_linear') == null
  }

  const [textures, setTextures] = useState(
    typeof texturesProp !== 'string' ? texturesProp : undefined
  )
  useEffect(() => {
    if (typeof texturesProp === 'string') {
      const loader = new PrecomputedTexturesLoader()
      loader.useHalfFloat = useHalfFloat
      ;(async () => {
        setTextures(await loader.loadAsync(texturesProp))
      })().catch(error => {
        console.error(error)
      })
    } else {
      setTextures(texturesProp)
    }
  }, [texturesProp, useHalfFloat])

  // TODO: STBN will be loaded even when shadow is not used.
  const [stbn, setSTBN] = useState(
    typeof stbnProp !== 'string' ? stbnProp : undefined
  )
  useEffect(() => {
    if (typeof stbnProp === 'string') {
      const loader = new STBNLoader()
      ;(async () => {
        setSTBN(await loader.loadAsync(stbnProp))
      })().catch(error => {
        console.error(error)
      })
    } else {
      setSTBN(stbnProp)
    }
  }, [stbnProp])

  const atoms = useMemo(
    () => ({
      overlayAtom: atom<AtmosphereOverlay | null>(null),
      shadowAtom: atom<AtmosphereShadow | null>(null),
      shadowLengthAtom: atom<AtmosphereShadowLength | null>(null)
    }),
    []
  )

  const context = useMemo(
    () => ({
      textures,
      useHalfFloat,
      ellipsoid,
      correctAltitude,
      photometric,
      stbn,
      transientStates: transientStatesRef.current,
      atoms
    }),
    [
      textures,
      useHalfFloat,
      ellipsoid,
      correctAltitude,
      photometric,
      stbn,
      atoms
    ]
  )

  const updateByDate: AtmosphereApi['updateByDate'] = useMemo(() => {
    const { sunDirection, moonDirection, rotationMatrix } =
      transientStatesRef.current
    return date => {
      getECIToECEFRotationMatrix(date, rotationMatrix)
      getSunDirectionECI(date, sunDirection).applyMatrix4(rotationMatrix)
      getMoonDirectionECI(date, moonDirection).applyMatrix4(rotationMatrix)
    }
  }, [])

  const timestamp = date != null && !isNaN(+date) ? +date : undefined
  useEffect(() => {
    if (timestamp != null) {
      updateByDate(timestamp)
    }
  }, [timestamp, updateByDate])

  useImperativeHandle(
    forwardedRef,
    () => ({
      ...transientStatesRef.current,
      textures,
      updateByDate
    }),
    [textures, updateByDate]
  )

  return (
    <AtmosphereContext.Provider value={context}>
      {children}
    </AtmosphereContext.Provider>
  )
})
