import { type GeodeticLike } from '@takram/three-geospatial'

import { useControls } from './useControls'

export interface LocationControlValues {
  longitude: number
  latitude: number
  height: number
}

export function useLocationControls(): GeodeticLike {
  const { longitude, latitude, altitude } = useControls('location', {
    longitude: { value: 0, min: -180, max: 180 },
    latitude: { value: 35, min: -90, max: 90 },
    altitude: { value: 2000, min: 0, max: 30000 }
  })
  return { longitude, latitude, height: altitude }
}
