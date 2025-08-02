import { useFrame } from '@react-three/fiber'
import type { GlobeControls } from '3d-tiles-renderer'
import { useSpring } from 'motion/react'
import { useEffect } from 'react'
import { useKeyPress } from 'react-use'
import { Vector3 } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

import { springOptions } from './springOptions'

const position = new Vector3()
const direction = new Vector3()
const up = new Vector3()
const forward = new Vector3()
const right = new Vector3()

export interface KeyboardControlOptions {
  speed?: number
}

export function useKeyboardControl({
  speed = 10
}: KeyboardControlOptions = {}): void {
  const motionX = useSpring(0, springOptions)
  const motionY = useSpring(0, springOptions)
  const motionZ = useSpring(0, springOptions)

  const [w] = useKeyPress('w')
  const [a] = useKeyPress('a')
  const [s] = useKeyPress('s')
  const [d] = useKeyPress('d')
  const [space] = useKeyPress(' ')
  const [c] = useKeyPress('c')

  useEffect(() => {
    motionX.set(d ? speed : a ? -speed : 0)
  }, [motionX, d]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    motionX.set(a ? -speed : d ? speed : 0)
  }, [motionX, a]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    motionY.set(w ? speed : s ? -speed : 0)
  }, [motionY, w]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    motionY.set(s ? -speed : w ? speed : 0)
  }, [motionY, s]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    motionZ.set(space ? speed : c ? -speed : 0)
  }, [motionZ, space]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    motionZ.set(c ? -speed : space ? speed : 0)
  }, [motionZ, c]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ camera, controls }) => {
    const x = motionX.get()
    const y = motionY.get()
    const z = motionZ.get()
    if (x === 0 && y === 0 && z === 0) {
      return
    }

    camera.getWorldPosition(position)
    camera.getWorldDirection(direction)
    Ellipsoid.WGS84.getSurfaceNormal(position, up)
    forward
      .copy(up)
      .multiplyScalar(direction.dot(up))
      .subVectors(direction, forward)
      .normalize()
    right.crossVectors(forward, up).normalize()

    camera.position
      .add(right.multiplyScalar(x))
      .add(forward.multiplyScalar(y))
      .add(up.multiplyScalar(z))

    // Likely due to dedupe, instanceof doesn't seem to work.
    if ((controls as { isGlobeControls?: boolean })?.isGlobeControls === true) {
      ;(controls as GlobeControls).adjustCamera(camera)
    }
  })
}
