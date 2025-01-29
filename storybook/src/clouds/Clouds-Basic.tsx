import { Box, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, useEffect, useRef, useState, type FC } from 'react'
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
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_HEIGHT,
  STBN_TEXTURE_WIDTH,
  type CloudsEffect
} from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
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

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useCloudsControls } from './useCloudsControls'

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
  const { longitude, latitude, height } = useLocationControls(
    {
      longitude: 30,
      height: 300
    },
    { collapsed: true }
  )
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { correctAltitude, photometric } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      photometric: true
    },
    { collapsed: true }
  )

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

  const stbnTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RedFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_WIDTH,
      height: STBN_TEXTURE_HEIGHT,
      depth: STBN_TEXTURE_DEPTH
    }),
    'core/stbn.bin'
  )

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)
  const [
    { enabled, debugShowUv, debugShowShadowMap, debugShowShadowLength },
    cloudsProps
  ] = useCloudsControls(clouds)

  const { showBox: debugShowBox } = useControls(
    'debug',
    { showBox: false },
    { collapsed: true }
  )

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={1000} />
      {debugShowBox && (
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
        <EffectComposer multisampling={0} enableNormalPass>
          <Fragment
            key={JSON.stringify([
              enabled,
              debugShowUv,
              debugShowShadowMap,
              debugShowShadowLength
            ])}
          >
            {enabled && (
              <Clouds
                ref={setClouds}
                stbnTexture={stbnTexture}
                shadow-maxFar={1e5}
                {...cloudsProps}
              />
            )}
            <AerialPerspective
              sky
              sunIrradiance
              skyIrradiance
              stbnTexture={stbnTexture}
            />
            {!debugShowUv && !debugShowShadowMap && !debugShowShadowLength && (
              <>
                <LensFlare />
                <ToneMapping mode={ToneMappingMode.AGX} />
                <SMAA />
                <Dithering />
              </>
            )}
          </Fragment>
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
