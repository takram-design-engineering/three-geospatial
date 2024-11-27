import { useControls } from './useControls'

export interface LocationControlValues {
  longitude: number
  latitude: number
  height: number
}

export function useLocationControls(): LocationControlValues {
  return useControls('location', {
    longitude: { value: 0, min: -180, max: 180 },
    latitude: { value: 35, min: -90, max: 90 },
    height: { value: 2000, min: 0, max: 30000 }
  })
}
