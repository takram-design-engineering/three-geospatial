import { OrbitControls, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef, useState, type FC } from 'react'
import {
  NoColorSpace,
  Quaternion,
  RepeatWrapping,
  Vector3,
  type Camera
} from 'three'
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import {
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  Ellipsoid,
  Geodetic,
  radians,
  type GeodeticLike
} from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { type CloudsEffect } from '@takram/three-global-clouds'
import { Clouds } from '@takram/three-global-clouds/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'

const geodetic = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

function applyLocation(
  camera: Camera,
  controls: OrbitControlsImpl,
  { longitude, latitude, height }: GeodeticLike
): void {
  geodetic.set(radians(longitude), radians(latitude), height)
  geodetic.toECEF(position)
  Ellipsoid.WGS84.getSurfaceNormal(position, up)

  rotation.setFromUnitVectors(camera.up, up)
  offset.copy(camera.position).sub(controls.target)
  offset.applyQuaternion(rotation)
  camera.up.copy(up)
  camera.position.copy(position).add(offset)
  controls.target.copy(position)
}

const Scene: FC = () => {
  useExposureControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls({ height: 300 })
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { correctAltitude, photometric } = useControls('atmosphere', {
    correctAltitude: true,
    photometric: true
  })
  const { coverage, phaseFunction } = useControls('clouds', {
    coverage: { value: 0.3, min: 0, max: 1, step: 0.01 },
    phaseFunction: {
      value: 'draine',
      options: ['2robes', '3robes', 'draine']
    }
  })

  const camera = useThree(({ camera }) => camera)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (controls != null) {
      applyLocation(camera, controls, {
        longitude,
        latitude,
        height
      })
    }
  }, [longitude, latitude, height, camera])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  const coverageDetailTexture = useTexture('/clouds/coverage_detail.png')
  coverageDetailTexture.wrapS = RepeatWrapping
  coverageDetailTexture.wrapT = RepeatWrapping
  const blueNoiseTexture = useTexture('/clouds/blue_noise.png')
  blueNoiseTexture.wrapS = RepeatWrapping
  blueNoiseTexture.wrapT = RepeatWrapping
  blueNoiseTexture.colorSpace = NoColorSpace

  const { useDetail, structuredSampling } = useControls('clouds', {
    useDetail: true,
    structuredSampling: false
  })

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)
  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.uniforms.useDetail.value = useDetail
    clouds.cloudsMaterial.structuredSampling = structuredSampling
  }, [clouds, useDetail, structuredSampling])

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={1000} />
      <Atmosphere
        ref={atmosphereRef}
        textures='atmosphere'
        correctAltitude={correctAltitude}
        photometric={photometric}
      >
        <Sky />
        <EffectComposer
          multisampling={0}
          key={clouds?.cloudsMaterial.fragmentShader}
        >
          <Clouds
            ref={setClouds}
            coverageDetailTexture={coverageDetailTexture}
            blueNoiseTexture={blueNoiseTexture}
            coverage={coverage}
            phaseFunction={phaseFunction}
          />
          <LensFlare />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Dithering />
        </EffectComposer>
      </Atmosphere>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false
    }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
