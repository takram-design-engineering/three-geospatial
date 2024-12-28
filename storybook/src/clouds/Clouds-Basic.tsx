import { Box, OrbitControls, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef, useState, type FC } from 'react'
import {
  NearestFilter,
  Quaternion,
  RedFormat,
  RepeatWrapping,
  Vector3,
  type Camera
} from 'three'
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  createData3DTextureLoaderClass,
  Ellipsoid,
  Geodetic,
  parseUint8Array,
  radians,
  type GeodeticLike
} from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_SIZE,
  type CloudsEffect
} from '@takram/three-global-clouds'
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
  const { coverage } = useControls('clouds', {
    coverage: { value: 0.3, min: 0, max: 1, step: 0.01 }
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

  const localWeatherTexture = useTexture('/clouds/local_weather.png')
  localWeatherTexture.wrapS = RepeatWrapping
  localWeatherTexture.wrapT = RepeatWrapping

  const blueNoiseTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RedFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_SIZE,
      height: STBN_TEXTURE_SIZE,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn_scalar.bin'
  )

  const {
    maxIterations,
    stepSize,
    maxStepSize,
    useDetail,
    usePowder,
    showBox
  } = useControls('clouds', {
    maxIterations: { value: 1000, min: 100, max: 2000 },
    stepSize: { value: 100, min: 10, max: 200 },
    maxStepSize: { value: 1000, min: 200, max: 2000 },
    useDetail: true,
    usePowder: false,
    showBox: false
  })

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)

  useFrame(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.uniforms.maxIterations.value = maxIterations
    clouds.cloudsMaterial.uniforms.initialStepSize.value = stepSize
    clouds.cloudsMaterial.uniforms.maxStepSize.value = maxStepSize
  })

  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.useDetail = useDetail
    clouds.cloudsMaterial.usePowder = usePowder
  }, [clouds, useDetail, usePowder])

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={1000} />
      {showBox && (
        <EastNorthUpFrame
          longitude={radians(longitude)}
          latitude={radians(latitude)}
        >
          <Box
            args={[2e3, 2e3, 2e3]}
            position={[1e3, -2e3, 1e3]}
            rotation={[Math.PI / 4, Math.PI / 4, 0]}
          >
            <meshBasicMaterial color='white' />
          </Box>
        </EastNorthUpFrame>
      )}
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
          enableNormalPass
        >
          <AerialPerspective sunIrradiance skyIrradiance />
          <Clouds
            ref={setClouds}
            localWeatherTexture={localWeatherTexture}
            blueNoiseTexture={blueNoiseTexture}
            coverage={coverage}
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
    camera={{ near: 1, far: 4e5 }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
