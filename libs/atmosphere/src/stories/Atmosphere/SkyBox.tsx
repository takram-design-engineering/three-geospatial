import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  RenderCubeTexture,
  TorusKnot
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useRef, type FC } from 'react'
import { Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Cartographic, Ellipsoid, LocalFrame, radians } from '@geovanni/core'

import { Atmosphere } from '../../Atmosphere'
import { SkyBox as SkyBoxCube, type SkyBoxImpl } from '../../SkyBox'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(radians(139.7671), radians(35.6812))
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

const Scene: FC = () => {
  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<SkyBoxImpl>(null)
  const atmosphere2Ref = useRef<SkyBoxImpl>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
    }
    if (atmosphere2Ref.current != null) {
      atmosphere2Ref.current.material.sunDirection = sunDirectionRef.current
    }
  })

  return (
    <>
      <OrbitControls target={position} minDistance={5} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} position={position} />
      <LocalFrame location={location}>
        <TorusKnot args={[1, 0.3, 256, 64]} position={[0, 0, 0]}>
          <meshPhysicalMaterial
            color={[0.4, 0.4, 0.4]}
            metalness={0}
            roughness={0}
            clearcoat={1}
          >
            <RenderCubeTexture attach='envMap' position={position}>
              <SkyBoxCube
                ref={atmosphere2Ref}
                position={position}
                sunAngularRadius={0.1}
              />
            </RenderCubeTexture>
          </meshPhysicalMaterial>
        </TorusKnot>
      </LocalFrame>
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
