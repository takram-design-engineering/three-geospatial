import { type FolderSettings } from 'leva/dist/declarations/src/types'

import { type GeodeticLike } from '@takram/three-geospatial'

import { useControls } from './useControls'

export interface LocationControlValues {
  longitude: number
  latitude: number
  height: number
  maxAltitude?: number
}

export function useLocationControls(
  {
    longitude: initialLongitude = 0,
    latitude: initialLatitude = 35,
    height: initialHeight = 2000,
    maxAltitude = 30000
  }: Partial<LocationControlValues> = {},
  folderSettings?: FolderSettings
): GeodeticLike {
  const { longitude, latitude, altitude } = useControls(
    'location',
    {
      longitude: { value: initialLongitude, min: -180, max: 180 },
      latitude: { value: initialLatitude, min: -90, max: 90 },
      altitude: { value: initialHeight, min: 0, max: maxAltitude }
    },
    folderSettings,
    [maxAltitude]
  )
  return { longitude, latitude, height: altitude }
}
