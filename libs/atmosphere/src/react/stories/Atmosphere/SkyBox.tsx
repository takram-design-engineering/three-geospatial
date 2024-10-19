import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  RenderCubeTexture,
  TorusKnot,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { Vector3 } from 'three'

import {
  Ellipsoid,
  Geodetic,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  radians
} from '@geovanni/core'
import { LocalTangentFrame } from '@geovanni/core/react'
import { Dithering, LensFlare } from '@geovanni/effects/react'

import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useLocalDateControls } from '../useLocalDateControls'
import { useRendererControls } from '../useRendererControls'

const location = new Geodetic(radians(139.7671), radians(35.6812), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const { photometric } = useControls('atmosphere', {
    photometric: false
  })

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const envMapRef = useRef<AtmosphereImpl>(null)

  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  const scene = useThree(({ scene }) => scene)
  useEffect(() => {
    scene.environment = envMap?.fbo.texture ?? null
  }, [envMap, scene])

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
        <Dithering />
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
      <Atmosphere
        ref={atmosphereRef}
        position={position}
        photometric={photometric}
      />
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
        <material>
          <RenderCubeTexture ref={setEnvMap} position={position}>
            <Atmosphere
              ref={envMapRef}
              photometric={photometric}
              sunAngularRadius={0.1}
            />
          </RenderCubeTexture>
        </material>
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
