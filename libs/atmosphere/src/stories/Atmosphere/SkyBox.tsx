import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  RenderCubeTexture,
  TorusKnot,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, useRef, useState, type FC } from 'react'
import { MeshBasicMaterial, Vector3 } from 'three'

import {
  Ellipsoid,
  Geodetic,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  radians
} from '@geovanni/core'
import { LensFlare } from '@geovanni/effects'
import { LocalTangentFrame, useRendererControls } from '@geovanni/react'

import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useMotionDate } from '../useMotionDate'

const location = new Geodetic(radians(139.7671), radians(35.6812), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)
const material = new MeshBasicMaterial()

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const envMapRef = useRef<AtmosphereImpl>(null)

  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (envMapRef.current != null) {
      envMapRef.current.material.sunDirection = sunDirectionRef.current
      envMapRef.current.material.moonDirection = moonDirectionRef.current
    }
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
      <OrbitControls target={position} minDistance={5} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} position={position} />
      <LocalTangentFrame location={location}>
        <TorusKnot args={[1, 0.3, 256, 64]} position={[0, 0, 0]}>
          <meshPhysicalMaterial
            color={[0.4, 0.4, 0.4]}
            metalness={0}
            roughness={0}
            clearcoat={1}
            envMap={envMap?.fbo.texture}
          />
        </TorusKnot>
        <primitive object={material}>
          <RenderCubeTexture ref={setEnvMap} position={position}>
            <Atmosphere ref={envMapRef} sunAngularRadius={0.1} />
          </RenderCubeTexture>
        </primitive>
      </LocalTangentFrame>
      {effectComposer}
    </>
  )
}

export const SkyBox: StoryFn = () => {
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
