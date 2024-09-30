import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useRef, type FC } from 'react'
import { Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Cartographic, Ellipsoid, radians } from '@geovanni/core'

import { SkyBox as Atmosphere, type SkyBoxImpl } from '../../SkyBox'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(radians(139.7671), radians(35.6812))
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

const Scene: FC = () => {
  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<SkyBoxImpl>(null)

  useFrame(() => {
    if (atmosphereRef.current == null) {
      return
    }
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    atmosphereRef.current.material.sunDirection = sunDirectionRef.current
  })

  return (
    <>
      <OrbitControls target={position} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} position={position} />
      <EffectComposer multisampling={0}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

export const SkyBox: StoryFn = () => {
  const { exposure } = useControls('gl', {
    exposure: { value: 10, min: 0, max: 100 }
  })
  return (
    <Canvas gl={{ toneMappingExposure: exposure }} camera={{ position, up }}>
      <Scene />
    </Canvas>
  )
}
