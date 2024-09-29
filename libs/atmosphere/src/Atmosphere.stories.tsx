import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useRef, type FC } from 'react'
import { Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Cartographic, Ellipsoid, radians } from '@geovanni/core'

import { Atmosphere, type AtmosphereImpl } from './Atmosphere'
import { useMotionDate } from './storybook/useMotionDate'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const location = new Cartographic(radians(139.7671), radians(35.6812))
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

const Scene: FC = () => {
  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)

  useFrame(() => {
    if (atmosphereRef.current == null) {
      return
    }
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    atmosphereRef.current.material.sunDirection = sunDirectionRef.current
  })

  return (
    <>
      <OrbitControls target={position} minDistance={1000} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} renderOrder={-1} />
      <EffectComposer multisampling={0}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

export const Basic: StoryFn = () => {
  const { exposure } = useControls('gl', {
    exposure: { value: 10, min: 0, max: 100 }
  })
  return (
    <Canvas
      gl={{
        logarithmicDepthBuffer: true,
        toneMappingExposure: exposure
      }}
      camera={{ near: 1, far: 1e8, position, up }}
    >
      <Scene />
    </Canvas>
  )
}
