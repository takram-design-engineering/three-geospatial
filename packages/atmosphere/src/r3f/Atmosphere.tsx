import { useThree } from '@react-three/fiber'
import {
  createContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type Ref
} from 'react'
import { Matrix4, Vector3 } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

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
  type AtmosphereIrradianceMask,
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from '../types'

export interface AtmosphereTransientStates {
  sunDirection: Vector3
  moonDirection: Vector3
  rotationMatrix: Matrix4
  ellipsoidCenter: Vector3
  ellipsoidMatrix: Matrix4
  overlay: AtmosphereOverlay | null
  shadow: AtmosphereShadow | null
  shadowLength: AtmosphereShadowLength | null
  irradianceMask: AtmosphereIrradianceMask | null
}

/** @deprecated Use AtmosphereTransientStates instead. */
export interface AtmosphereTransientProps extends AtmosphereTransientStates {}

export interface AtmosphereContextValue {
  textures?: PrecomputedTextures | null
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  transientStates?: AtmosphereTransientStates
}

export const AtmosphereContext =
  /*#__PURE__*/ createContext<AtmosphereContextValue>({})

export interface AtmosphereApi extends AtmosphereTransientStates {
  textures?: PrecomputedTextures
  updateByDate: (date: number | Date) => void
}

export interface AtmosphereProps {
  ref?: Ref<AtmosphereApi>
  textures?: PrecomputedTextures | string
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  date?: number | Date
  children?: ReactNode
}

export const Atmosphere: FC<AtmosphereProps> = ({
  ref: forwardedRef,
  textures: texturesProp = DEFAULT_PRECOMPUTED_TEXTURES_URL,
  ellipsoid = Ellipsoid.WGS84,
  correctAltitude = true,
  photometric = true,
  date,
  children
}) => {
  const transientStatesRef = useRef({
    sunDirection: new Vector3(),
    moonDirection: new Vector3(),
    rotationMatrix: new Matrix4(),
    ellipsoidCenter: new Vector3(),
    ellipsoidMatrix: new Matrix4(),
    overlay: null,
    shadow: null,
    shadowLength: null,
    irradianceMask: null
  })

  const gl = useThree(({ gl }) => gl)
  const [textures, setTextures] = useState(
    typeof texturesProp !== 'string' ? texturesProp : undefined
  )
  useEffect(() => {
    if (typeof texturesProp === 'string') {
      const loader = new PrecomputedTexturesLoader()
      loader.setTypeFromRenderer(gl)
      ;(async () => {
        setTextures(await loader.loadAsync(texturesProp))
      })().catch(error => {
        console.error(error)
      })
    } else {
      setTextures(texturesProp)
    }
  }, [texturesProp, gl])

  const context = useMemo(
    () => ({
      textures,
      ellipsoid,
      correctAltitude,
      photometric,
      transientStates: transientStatesRef.current
    }),
    [textures, ellipsoid, correctAltitude, photometric]
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
}
