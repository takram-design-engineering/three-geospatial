/// <reference types="vite/types/importMeta.d.ts" />

import { OrbitControls, TorusKnot } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type FC
} from 'react'
import { MeshBasicMaterial, MeshLambertMaterial } from 'three'

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
  Ellipsoid,
  Geodetic,
  PointOfView,
  radians
} from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame, EllipsoidMesh } from '@takram/three-geospatial/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

const geodetic = new Geodetic(radians(138.5), radians(36.2), 5000)
const position = geodetic.toECEF()

const terrainBasicMaterial = new MeshBasicMaterial({ color: 'gray' })
const terrainLambertMaterial = new MeshLambertMaterial({ color: 'gray' })

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
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
  const { correctAltitude } = useControls(
    'atmosphere',
    { correctAltitude: true },
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
      options: ['post-process', 'light-source'] as const
    },
    sun: true,
    sky: true
  })

  const camera = useThree(({ camera }) => camera)
  const [controls, setControls] = useState<ComponentRef<
    typeof OrbitControls
  > | null>(null)

  useEffect(() => {
    const pov = new PointOfView(2000, radians(-90), radians(-20))
    pov.decompose(position, camera.position, camera.quaternion, camera.up)
    if (controls != null) {
      controls.target.copy(position)
      controls.update()
    }
  }, [camera, controls])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    const atmosphere = atmosphereRef.current
    if (atmosphere == null) {
      return
    }
    atmosphere.updateByDate(new Date(motionDate.get()))
  })

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
      <OrbitControls ref={setControls} />

      {/* Background objects and light sources */}
      <Sky />
      <Stars data='atmosphere/stars.bin' />
      {mode === 'light-source' && (
        <group position={position}>
          {sun && <SunLight />}
          {sky && <SkyLight />}
        </group>
      )}

      {/* An ellipsoid mesh for fill empty region */}
      <EllipsoidMesh args={[Ellipsoid.WGS84.radii, 360, 180]}>
        {mode === 'light-source' ? (
          <meshLambertMaterial color='gray' />
        ) : (
          <meshBasicMaterial color='gray' />
        )}
      </EllipsoidMesh>

      {/* Quantized mesh terrain */}
      <TilesRenderer>
        <TilesPlugin
          plugin={CesiumIonAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
            assetId: 2767062, // Japan Regional Terrain
            autoRefreshToken: true
          }}
        />
        <TilesPlugin
          key={mode}
          plugin={TileMeshPropsPlugin}
          args={{
            material:
              mode === 'light-source'
                ? terrainLambertMaterial
                : terrainBasicMaterial
          }}
        />
      </TilesRenderer>

      {/* Scene objects in a ENU frame */}
      <EastNorthUpFrame {...geodetic}>
        <TorusKnot args={[200, 60, 256, 64]} position={[0, 0, 20]}>
          {mode === 'light-source' ? (
            <meshLambertMaterial color='white' />
          ) : (
            <meshBasicMaterial color='white' />
          )}
        </TorusKnot>
      </EastNorthUpFrame>

      {/* Post-processing */}
      <EffectComposer multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify([
            enabled,
            mode,
            sun,
            sky,
            transmittance,
            inscatter,
            lensFlare,
            normal,
            depth
          ])}
        >
          {enabled && !normal && !depth && (
            <AerialPerspective
              sunLight={mode === 'post-process' && sun}
              skyLight={mode === 'post-process' && sky}
              transmittance={transmittance}
              inscatter={inscatter}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={toneMappingMode} />
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
      depth: false,
      logarithmicDepthBuffer: true
    }}
    camera={{ near: 100, far: 1e6 }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
