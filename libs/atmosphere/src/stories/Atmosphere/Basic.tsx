import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, useRef, type FC } from 'react'
import { Vector3 } from 'three'

import {
  Ellipsoid,
  Geodetic,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  radians
} from '@geovanni/core'
import { LensFlare } from '@geovanni/effects'
import { useRendererControls } from '@geovanni/react'

import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useMotionDate } from '../useMotionDate'

const location = new Geodetic(radians(139.7671), radians(35.6812), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)

  useFrame(() => {
    if (atmosphereRef.current == null) {
      return
    }
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    atmosphereRef.current.material.sunDirection = sunDirectionRef.current
    atmosphereRef.current.material.moonDirection = moonDirectionRef.current
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} multisampling={0}>
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    ),
    []
  )

  return (
    <>
      <OrbitControls target={position} minDistance={1000} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} />
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => {
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false
      }}
      camera={{ position, up }}
    >
      <Scene />
    </Canvas>
  )
}
