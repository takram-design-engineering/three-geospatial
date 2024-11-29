import { OrbitControls, TorusKnot } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, Suspense, useRef, type FC } from 'react'
import { MeshBasicMaterial } from 'three'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  Stars,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  Ellipsoid,
  Geodetic,
  radians,
  TilingScheme
} from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame, EllipsoidMesh } from '@takram/three-geospatial/r3f'
import { IonTerrain } from '@takram/three-terrain'
import { BatchedTerrainTile } from '@takram/three-terrain/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'

const location = new Geodetic(radians(138.731), radians(35.363), 4500)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.getTile(location, 7)
const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const material = new MeshBasicMaterial({ color: 'white' })
const terrainMaterial = new MeshBasicMaterial({ color: 'gray' })

const Scene: FC = () => {
  useExposureControls({ exposure: 10 })
  const { lensFlare, normal, depth } = useControls(
    'effects',
    {
      lensFlare: true,
      depth: false,
      normal: false
    },
    { collapsed: true }
  )
  const motionDate = useLocalDateControls()
  const { correctAltitude, photometric } = useControls('atmosphere', {
    correctAltitude: true,
    photometric: true
  })
  const { enabled, sun, sky, transmittance, inscatter } = useControls(
    'aerial perspective',
    {
      enabled: true,
      sun: true,
      sky: true,
      transmittance: true,
      inscatter: true
    }
  )

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  return (
    <Atmosphere
      ref={atmosphereRef}
      textures='/'
      correctAltitude={correctAltitude}
      photometric={photometric}
    >
      <OrbitControls target={position} minDistance={1e3} />
      <Sky renderTargetCount={2} />
      <Stars data='/stars.bin' renderTargetCount={2} />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 360, 180]}
        material={terrainMaterial}
      />
      <Suspense>
        <BatchedTerrainTile
          terrain={terrain}
          {...tile}
          depth={5}
          computeVertexNormals
          material={terrainMaterial}
        />
      </Suspense>
      <EastNorthUpFrame {...location}>
        <TorusKnot
          args={[200, 60, 256, 64]}
          position={[0, 0, 20]}
          material={material}
        />
      </EastNorthUpFrame>
      <EffectComposer multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            enabled,
            sun,
            sky,
            transmittance,
            inscatter,
            lensFlare,
            normal,
            depth
          })}
        >
          {enabled && !normal && !depth && (
            <AerialPerspective
              sunIrradiance={sun}
              skyIrradiance={sky}
              transmittance={transmittance}
              inscatter={inscatter}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal octEncoded />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={ToneMappingMode.AGX} />
              <SMAA />
              <Dithering />
            </>
          )}
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false,
      logarithmicDepthBuffer: true
    }}
    camera={{ near: 100, far: 1e6, position, up }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
