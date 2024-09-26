import { Ellipsoid } from '@math.gl/geospatial'
import { createContext, useMemo, type FC, type ReactNode } from 'react'
import { Matrix4, Quaternion } from 'three'

import { type Tuple3 } from './types'

export const LocalFrameContext = createContext<Matrix4 | undefined>(undefined)

export const LocalFrame: FC<{
  longitude: number
  latitude: number
  children?: ReactNode
}> = ({ longitude, latitude, children }) => {
  const position = useMemo(
    () =>
      Ellipsoid.WGS84.cartographicToCartesian([
        longitude,
        latitude,
        0
      ]) as Tuple3,
    [longitude, latitude]
  )

  const matrix = useMemo(
    () =>
      new Matrix4().fromArray(
        Ellipsoid.WGS84.eastNorthUpToFixedFrame(position)
      ),
    [position]
  )

  const quaternion = useMemo(
    () =>
      new Quaternion().setFromRotationMatrix(
        new Matrix4().extractRotation(matrix)
      ),
    [matrix]
  )

  return (
    <group position={position} quaternion={quaternion}>
      <LocalFrameContext.Provider value={matrix}>
        {children}
      </LocalFrameContext.Provider>
    </group>
  )
}
