import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  RenderCubeTexture,
  TorusKnot,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
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
import { EastNorthUpFrame } from '@geovanni/core/react'
import { Dithering, LensFlare } from '@geovanni/effects/react'

import { Sky, type SkyImpl } from '../react/Sky'
import { useLocalDateControls } from './helpers/useLocalDateControls'
import { useRendererControls } from './helpers/useRendererControls'

const location = new Geodetic(radians(139.7671), radians(35.6812), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const { osculateEllipsoid, photometric } = useControls('atmosphere', {
    osculateEllipsoid: true,
    photometric: false
  })

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const skyRef = useRef<SkyImpl>(null)
  const envMapRef = useRef<SkyImpl>(null)

  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  const scene = useThree(({ scene }) => scene)
  useEffect(() => {
    scene.environment = envMap?.fbo.texture ?? null
  }, [envMap, scene])

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    if (skyRef.current != null) {
      skyRef.current.material.sunDirection = sunDirectionRef.current
      skyRef.current.material.moonDirection = moonDirectionRef.current
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
        <SMAA />
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
      <Sky
        ref={skyRef}
        position={position}
        osculateEllipsoid={osculateEllipsoid}
        photometric={photometric}
      />
      <EastNorthUpFrame {...location}>
        <TorusKnot args={[1, 0.3, 256, 64]} position={[0, 0, 0]}>
          <meshPhysicalMaterial
            color={[0.4, 0.4, 0.4]}
            metalness={0}
            roughness={1}
            clearcoat={0.5}
            envMap={envMap?.fbo.texture}
          />
        </TorusKnot>
        <material>
          <RenderCubeTexture
            ref={setEnvMap}
            resolution={64}
            position={position}
          >
            <Sky
              ref={envMapRef}
              osculateEllipsoid={osculateEllipsoid}
              photometric={photometric}
              sunAngularRadius={0.1}
            />
          </RenderCubeTexture>
        </material>
      </EastNorthUpFrame>
      {effectComposer}
    </>
  )
}

export const EnvMap: StoryFn = () => {
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
