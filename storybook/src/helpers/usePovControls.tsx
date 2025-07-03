import { button } from 'leva'
import type { FolderSettings } from 'leva/dist/declarations/src/types'
import { Ray, type Camera } from 'three'

import {
  degrees,
  Ellipsoid,
  Geodetic,
  PointOfView
} from '@takram/three-geospatial'

import { useControls } from './useControls'

export function usePovControls(
  camera: Camera,
  folderSettings?: FolderSettings
): void {
  useControls(
    'pov',
    {
      copy: button(() => {
        const pov = new PointOfView().setFromCamera(camera)
        if (pov == null) {
          return
        }
        const ray = new Ray()
        camera.getWorldPosition(ray.origin)
        camera.getWorldDirection(ray.direction)
        const target = Ellipsoid.WGS84.getIntersection(ray)
        if (target == null) {
          return
        }
        let geodetic
        try {
          geodetic = new Geodetic().setFromECEF(target)
        } catch (error: unknown) {
          return // Ignore
        }
        navigator.clipboard
          .writeText(
            [
              `longitude={${degrees(geodetic.longitude).toFixed(4)}}`,
              `latitude={${degrees(geodetic.latitude).toFixed(4)}}`,
              `heading={${Math.round(degrees(pov.heading))}}`,
              `pitch={${Math.round(degrees(pov.pitch))}}`,
              `distance={${Math.round(pov.distance)}}`
            ].join('\n')
          )
          .catch((error: unknown) => {
            console.error(error)
          })
      })
    },
    folderSettings
  )
}
