import { useThree } from '@react-three/fiber'
import { getDefaultStore } from 'jotai'
import { useContext, useLayoutEffect } from 'react'
import { useKeyPressEvent } from 'react-use'
import { Vector3 } from 'three'

import {
  degrees,
  Geodetic,
  PointOfView,
  radians
} from '@takram/three-geospatial'

import { StoryContext } from '../helpers/StoryContext'

const vectorScratch = new Vector3()
const povScratch = new PointOfView()
const geodeticScratch = new Geodetic()

export interface PointOfViewProps {
  longitude: number
  latitude: number
  height?: number
  heading: number
  pitch: number
  distance: number
}

export function usePointOfView({
  longitude,
  latitude,
  height = 0,
  heading,
  pitch,
  distance
}: PointOfViewProps): void {
  const camera = useThree(({ camera }) => camera)
  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude), height).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, height, heading, pitch, distance, camera])

  const { argsAtom } = useContext(StoryContext)

  useKeyPressEvent('d', () => {
    const target = vectorScratch
    const pov = povScratch.setFromCamera(camera, undefined, target)
    if (pov != null) {
      const { longitude, latitude } = geodeticScratch.setFromECEF(target)
      let text = ''
      text += `longitude: ${Number(degrees(longitude).toFixed(4))},\n`
      text += `latitude: ${Number(degrees(latitude).toFixed(4))},\n`
      text += `heading: ${Math.round(degrees(pov.heading))},\n`
      text += `pitch: ${Math.round(degrees(pov.pitch))},\n`
      text += `distance: ${Math.round(pov.distance)}\n`

      const store = getDefaultStore()
      const args = store.get(argsAtom)
      text += `toneMappingExposure: ${args.toneMappingExposure},\n`
      text += `dayOfYear: ${args.dayOfYear},\n`
      text += `timeOfDay: ${Number(args.timeOfDay?.toFixed(1))}\n`

      console.log(text)
    }
  })
}
