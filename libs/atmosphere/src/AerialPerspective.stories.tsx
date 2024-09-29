import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere,
  TorusKnot
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import { parseISO } from 'date-fns'
import { useControls } from 'leva'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useRef, type FC } from 'react'
import { Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Cartographic, Ellipsoid, LocalFrame, radians } from '@geovanni/core'
import { Depth, Normal } from '@geovanni/effects'

import { AerialPerspective } from './AerialPerspective'
import { type AerialPerspectiveEffect } from './AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from './Atmosphere'

export default {
  title: 'atmosphere/AerialPerspective',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

const location = new Cartographic(radians(139.7671), radians(35.6812))
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

const Scene: FC = () => {
  const { normal, depth } = useControls('pass', {
    normal: false,
    depth: false
  })

  const dateRef = useRef(+parseISO('2000-07-01T05:00:00+09:00'))
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    if (atmosphereRef.current == null || aerialPerspectiveRef.current == null) {
      return
    }
    getSunDirectionECEF(new Date(dateRef.current), sunDirectionRef.current)
    atmosphereRef.current.material.sunDirection = sunDirectionRef.current
    aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    dateRef.current += 100000
  })

  return (
    <>
      <OrbitControls target={position} minDistance={1000} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} renderOrder={-1} />
      <ambientLight intensity={2} />
      <Sphere args={[Ellipsoid.WGS84.minimumRadius, 360, 180]} receiveShadow>
        <meshStandardMaterial color='black' />
      </Sphere>
      <LocalFrame location={location}>
        <TorusKnot args={[200, 60, 256, 64]} position={[0, 0, 20]}>
          <meshStandardMaterial color='white' />
        </TorusKnot>
      </LocalFrame>
      <EffectComposer enableNormalPass multisampling={0}>
        <AerialPerspective ref={aerialPerspectiveRef} />
        <Normal
          blendFunction={normal ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <Depth
          useTurbo
          blendFunction={depth ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <ToneMapping
          mode={ToneMappingMode.ACES_FILMIC}
          blendFunction={
            !normal && !depth ? BlendFunction.NORMAL : BlendFunction.SKIP
          }
        />
        <SMAA />
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
