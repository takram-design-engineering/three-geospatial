import { Ellipsoid } from '@math.gl/geospatial'
import { createContext, useMemo, type FC, type ReactNode } from 'react'
import { Matrix4, Quaternion } from 'three'

import { type Geodetic } from '@geovanni/core'

export const LocalFrameContext = createContext<Matrix4 | undefined>(undefined)

export const LocalFrame: FC<{
  location: Geodetic
  children?: ReactNode
}> = ({ location, children }) => {
  // TODO
  const position = useMemo(() => location.toVector(), [location])

  const matrix = useMemo(
    () =>
      new Matrix4().fromArray(
        // TODO
        Ellipsoid.WGS84.eastNorthUpToFixedFrame(position.toArray())
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
