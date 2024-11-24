import { OrbitControls, TorusKnot } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, Suspense, useRef, type FC } from 'react'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  Stars,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal
} from '@takram/three-effects/r3f'
import {
  Ellipsoid,
  Geodetic,
  radians,
  TilingScheme
} from '@takram/three-geospatial'
import { EastNorthUpFrame, EllipsoidMesh } from '@takram/three-geospatial/r3f'
import { IonTerrain } from '@takram/three-terrain'
import { BatchedTerrainTile } from '@takram/three-terrain/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

const location = new Geodetic(radians(138.731), radians(35.363), 4500)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
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
  const { osculateEllipsoid, photometric } = useControls(
    'atmosphere',
    {
      osculateEllipsoid: true,
      photometric: true
    },
    { collapsed: true }
  )
  const { enabled, transmittance, inscatter } = useControls(
    'aerial perspective',
    {
      enabled: true,
      transmittance: true,
      inscatter: true
    }
  )
  const { mode, sun, sky } = useControls('lighting', {
    mode: {
      options: ['forward', 'deferred'] as const
    },
    shadow: true,
    sun: true,
    sky: true
  })

  // const { gl, scene } = useThree()
  // useLayoutEffect(() => {
  //   gl.shadowMap.enabled = shadow
  //   scene.traverse(child => {
  //     if ('material' in child && child.material instanceof Material) {
  //       child.material.needsUpdate = true
  //     }
  //   })
  // }, [shadow, gl, scene])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    const atmosphere = atmosphereRef.current
    if (atmosphere == null) {
      return
    }
    atmosphere.updateByDate(new Date(motionDate.get()))
  })

  return (
    <Atmosphere
      ref={atmosphereRef}
      texturesUrl='/'
      osculateEllipsoid={osculateEllipsoid}
      photometric={photometric}
    >
      <OrbitControls target={position} minDistance={1e3} />
      <Sky />
      {mode === 'forward' && (
        <group position={position}>
          {sun && <SunLight />}
          {sky && <SkyLight />}
        </group>
      )}
      <Stars dataUrl='/stars.bin' />
      <EllipsoidMesh args={[Ellipsoid.WGS84.radii, 360, 180]} receiveShadow>
        {mode === 'forward' ? (
          <meshLambertMaterial color='gray' />
        ) : (
          <meshBasicMaterial color='gray' />
        )}
      </EllipsoidMesh>
      <Suspense>
        <BatchedTerrainTile
          terrain={terrain}
          {...tile}
          depth={5}
          computeVertexNormals
          receiveShadow
          castShadow
        >
          {mode === 'forward' ? (
            <meshLambertMaterial color='gray' />
          ) : (
            <meshBasicMaterial color='gray' />
          )}
        </BatchedTerrainTile>
      </Suspense>
      <EastNorthUpFrame {...location}>
        <TorusKnot
          args={[200, 60, 256, 64]}
          position={[0, 0, 20]}
          receiveShadow
          castShadow
        >
          {mode === 'forward' ? (
            <meshLambertMaterial color='white' />
          ) : (
            <meshBasicMaterial color='white' />
          )}
        </TorusKnot>
      </EastNorthUpFrame>
      <EffectComposer multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            enabled,
            mode,
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
              sunIrradiance={mode === 'deferred' && sun}
              skyIrradiance={mode === 'deferred' && sky}
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
