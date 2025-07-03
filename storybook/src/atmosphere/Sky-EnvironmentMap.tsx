import {
  OrbitControls,
  RenderCubeTexture,
  TorusKnot,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { useEffect, useRef, useState, type FC } from 'react'
import type { Group } from 'three'

import {
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'

import { Stats } from '../helpers/Stats'
import { useApplyLocation } from '../helpers/useApplyLocation'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls()
  const motionDate = useLocalDateControls({ longitude, dayOfYear: 0 })
  const { correctAltitude } = useControls('atmosphere', {
    correctAltitude: true
  })

  const scene = useThree(({ scene }) => scene)
  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  useEffect(() => {
    scene.environment = envMap?.fbo.texture ?? null
  }, [scene, envMap])

  const envMapParentRef = useRef<Group>(null)
  const controlsRef = useApplyLocation(
    { longitude, latitude, height },
    position => {
      envMapParentRef.current?.position.copy(position)
    }
  )

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={5} />
      <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
        <Sky />
        <group ref={envMapParentRef}>
          <RenderCubeTexture ref={setEnvMap} resolution={64}>
            <Sky
              // Increase this to avoid flickers. Total radiance doesn't change.
              sunAngularRadius={0.1}
            />
          </RenderCubeTexture>
        </group>
      </Atmosphere>
      <EastNorthUpFrame
        longitude={radians(longitude)}
        latitude={radians(latitude)}
        height={height}
      >
        <TorusKnot args={[1, 0.3, 256, 64]}>
          <meshPhysicalMaterial
            color={[0.4, 0.4, 0.4]}
            metalness={0}
            roughness={1}
            clearcoat={0.5}
          />
        </TorusKnot>
      </EastNorthUpFrame>
      <EffectComposer>
        <LensFlare />
        <ToneMapping mode={toneMappingMode} />
        <Dithering />
      </EffectComposer>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas gl={{ depth: false }}>
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
