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

import { Ellipsoid } from '@geovanni/core'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '../celestialDirections'
import {
  PrecomputedTexturesLoader,
  type PrecomputedTextures
} from '../PrecomputedTexturesLoader'

export interface AtmosphereTransientProps {
  sunDirection: Vector3
  moonDirection: Vector3
  rotationMatrix: Matrix4
}

export interface AtmosphereContextValue {
  textures?: PrecomputedTextures | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  transientProps?: AtmosphereTransientProps
}

export const AtmosphereContext = createContext<AtmosphereContextValue>({})

export interface AtmosphereProps {
  textures?: PrecomputedTextures | null
  texturesUrl?: string
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  children?: ReactNode
}

export interface AtmosphereApi extends AtmosphereTransientProps {
  update: (date: number | Date) => void
}

export const Atmosphere = forwardRef<AtmosphereApi, AtmosphereProps>(
  function Atmosphere(
    {
      textures: texturesProp,
      texturesUrl,
      useHalfFloat = false,
      ellipsoid = Ellipsoid.WGS84,
      osculateEllipsoid = true,
      photometric = true,
      children
    },
    forwardedRef
  ) {
    const transientPropsRef = useRef({
      sunDirection: new Vector3(),
      moonDirection: new Vector3(),
      rotationMatrix: new Matrix4()
    })

    const [textures, setTextures] = useState(texturesProp)
    useEffect(() => {
      if (texturesProp != null) {
        setTextures(texturesProp)
      } else if (texturesUrl != null) {
        const loader = new PrecomputedTexturesLoader()
        loader.useHalfFloat = useHalfFloat
        ;(async () => {
          setTextures(await loader.loadAsync(texturesUrl))
        })().catch(error => {
          console.error(error)
        })
      } else {
        setTextures(undefined)
      }
    }, [texturesProp, texturesUrl, useHalfFloat])

    const context = useMemo(
      () => ({
        textures,
        useHalfFloat,
        ellipsoid,
        osculateEllipsoid,
        photometric,
        transientProps: transientPropsRef.current
      }),
      [textures, useHalfFloat, ellipsoid, osculateEllipsoid, photometric]
    )

    const update: AtmosphereApi['update'] = useMemo(() => {
      const { sunDirection, moonDirection, rotationMatrix } =
        transientPropsRef.current
      return date => {
        getSunDirectionECEF(date, sunDirection)
        getMoonDirectionECEF(date, moonDirection)
        getECIToECEFRotationMatrix(date, rotationMatrix)
      }
    }, [])

    useImperativeHandle(forwardedRef, () => ({
      ...transientPropsRef.current,
      update
    }))

    return (
      <AtmosphereContext.Provider value={context}>
        {children}
      </AtmosphereContext.Provider>
    )
  }
)
