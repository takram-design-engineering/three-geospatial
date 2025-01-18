import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere
} from '@react-three/drei'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useState, type FC } from 'react'
import { NearestFilter, RepeatWrapping, RGBAFormat, Vector3 } from 'three'

import {
  AerialPerspective,
  Atmosphere,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_HEIGHT,
  STBN_TEXTURE_WIDTH
} from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
import {
  createData3DTextureLoaderClass,
  Ellipsoid,
  Geodetic,
  parseUint8Array,
  radians
} from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'

const geodetic = new Geodetic()
const position = new Vector3()
const east = new Vector3()
const north = new Vector3()
const up = new Vector3()

const Scene: FC = () => {
  useExposureControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls({
    height: 500
  })
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { correctAltitude } = useControls('atmosphere', {
    correctAltitude: true
  })
  const { coverage } = useControls('clouds', {
    coverage: { value: 0.3, min: 0, max: 1, step: 0.01 }
  })

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useFrame(() => {
    if (atmosphere == null) {
      return
    }
    atmosphere.updateByDate(new Date(motionDate.get()))

    // Offset the ellipsoid so that the world space origin locates at the
    // position relative to the ellipsoid.
    geodetic.set(radians(longitude), radians(latitude), height)
    geodetic.toECEF(position)
    atmosphere.ellipsoidCenter.copy(position).multiplyScalar(-1)

    // Rotate the ellipsoid around the world space origin so that the camera's
    // orientation aligns with X: east, Y: up, Z: north, for example.
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up)
    atmosphere.ellipsoidMatrix.makeBasis(east, up, north).invert()
  })

  const stbnTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_WIDTH,
      height: STBN_TEXTURE_HEIGHT,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn.bin'
  )

  return (
    <>
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]}>
        <meshBasicMaterial color='white' />
      </Sphere>
      <Atmosphere
        ref={setAtmosphere}
        textures='atmosphere'
        correctAltitude={correctAltitude}
      >
        <EffectComposer multisampling={0} enableNormalPass>
          <AerialPerspective sky skyIrradiance sunIrradiance />
          <Clouds stbnTexture={stbnTexture} coverage={coverage} />
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
    camera={{ position: [2, 1, 2] }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
