import { useFrame } from '@react-three/fiber'
import { MotionValue } from 'framer-motion'
import { createContext, useMemo, useRef, type FC, type ReactNode } from 'react'
import { Matrix4, Vector3 } from 'three'

import { Ellipsoid } from '@geovanni/core'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '../celestialDirections'

export interface AtmosphereContextValue {
  sunDirection: Vector3
  moonDirection: Vector3
  rotationMatrix: Matrix4
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
}

export const AtmosphereContext = createContext<AtmosphereContextValue>({
  sunDirection: new Vector3(),
  moonDirection: new Vector3(),
  rotationMatrix: new Matrix4()
})

export interface AtmosphereProps {
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  date?: number | Date | MotionValue<number> | MotionValue<Date>
  children?: ReactNode
}

export const Atmosphere: FC<AtmosphereProps> = ({
  date: dateProp,
  useHalfFloat = false,
  ellipsoid = Ellipsoid.WGS84,
  osculateEllipsoid = true,
  photometric = true,
  children
}) => {
  const stateRef = useRef<AtmosphereContextValue>({
    sunDirection: new Vector3(),
    moonDirection: new Vector3(),
    rotationMatrix: new Matrix4()
  })

  useFrame(() => {
    const date =
      dateProp != null
        ? dateProp instanceof MotionValue
          ? dateProp.get()
          : dateProp
        : Date.now()
    const { sunDirection, moonDirection, rotationMatrix } = stateRef.current
    getSunDirectionECEF(date, sunDirection)
    getMoonDirectionECEF(date, moonDirection)
    getECIToECEFRotationMatrix(date, rotationMatrix)
  })

  const context = useMemo(
    () => ({
      useHalfFloat,
      ellipsoid,
      osculateEllipsoid,
      photometric,
      ...stateRef.current
    }),
    [useHalfFloat, ellipsoid, osculateEllipsoid, photometric]
  )

  return (
    <AtmosphereContext.Provider value={context}>
      {children}
    </AtmosphereContext.Provider>
  )
}
