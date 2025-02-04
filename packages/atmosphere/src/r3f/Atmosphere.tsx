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
import { Matrix4, Vector3 } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '../celestialDirections'
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
  date?: number | Date
  children?: ReactNode
}

export interface AtmosphereApi extends AtmosphereTransientProps {
  textures?: PrecomputedTextures
  updateByDate: (date: number | Date) => void
}

export const Atmosphere = /*#__PURE__*/ forwardRef<
  AtmosphereApi,
  AtmosphereProps
>(function Atmosphere(
  {
    textures:
      texturesProp = 'https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/9627216cc50057994c98a2118f3c4a23765d43b9/packages/atmosphere/assets',
    useHalfFloat,
    ellipsoid = Ellipsoid.WGS84,
    correctAltitude = true,
    photometric = true,
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
      transientStates: transientStatesRef.current,
      atoms
    }),
    [textures, useHalfFloat, ellipsoid, correctAltitude, photometric, atoms]
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
