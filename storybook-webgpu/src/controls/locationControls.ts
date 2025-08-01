import type { ArgTypes } from '@storybook/react-vite'
import type { MotionValue } from 'framer-motion'
import { Vector3, type Matrix4 } from 'three'

import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'

import { useCombinedChange } from '../helpers/useCombinedChange'
import { useSpringControl } from '../helpers/useSpringControl'

export interface LocationArgs {
  longitude: number
  latitude: number
  height: number
}

export const locationArgs = (
  defaults?: Partial<LocationArgs>
): LocationArgs => ({
  longitude: 0,
  latitude: 0,
  height: 0,
  ...defaults
})

export const locationArgTypes = (
  defaults: {
    minHeight?: number
    maxHeight?: number
  } = {}
): ArgTypes<LocationArgs> => ({
  longitude: {
    control: {
      type: 'range',
      min: -180,
      max: 180
    },
    table: { category: 'location' }
  },
  latitude: {
    control: {
      type: 'range',
      min: -90,
      max: 90
    },
    table: { category: 'location' }
  },
  height: {
    control: {
      type: 'range',
      min: defaults.minHeight ?? 0,
      max: defaults.maxHeight ?? 30000
    },
    table: { category: 'location' }
  }
})

const geodetic = new Geodetic()
const position = new Vector3()

export function useLocationControls(
  worldToECEFMatrix: Matrix4,
  onChange?: (longitude: number, latitude: number, height: number) => void
): [MotionValue<number>, MotionValue<number>, MotionValue<number>] {
  const longitude = useSpringControl(({ longitude }: LocationArgs) => longitude)
  const latitude = useSpringControl(({ latitude }: LocationArgs) => latitude)
  const height = useSpringControl(({ height }: LocationArgs) => height)

  useCombinedChange(
    [longitude, latitude, height],
    ([longitude, latitude, height]) => {
      Ellipsoid.WGS84.getNorthUpEastFrame(
        geodetic
          .set(radians(longitude), radians(latitude), height)
          .toECEF(position),
        worldToECEFMatrix
      )
      onChange?.(longitude, latitude, height)
    }
  )

  return [longitude, latitude, height]
}
