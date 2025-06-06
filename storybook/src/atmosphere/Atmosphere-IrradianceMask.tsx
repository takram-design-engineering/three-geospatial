/// <reference types="vite/types/importMeta.d.ts" />

import { css } from '@emotion/react'
import {
  OrbitControls,
  RenderCubeTexture,
  useGLTF,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react-vite'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  TilesAttributionOverlay,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { Fragment, useEffect, useRef, useState, type FC } from 'react'
import { Layers, Vector3, type Group } from 'three'
import { DRACOLoader } from 'three-stdlib'

import { type AerialPerspectiveEffect } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  IrradianceMask,
  Sky,
  SkyLight,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'

const longitude = -110
const latitude = 45
const height = 408000
const geodetic = new Geodetic(radians(longitude), radians(latitude), height)
const position = geodetic.toECEF()
const east = new Vector3()
const north = new Vector3()
const up = new Vector3()

const IRRADIANCE_MASK_LAYER = 10
const layers = new Layers()
layers.enable(IRRADIANCE_MASK_LAYER)

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 8 })
  const motionDate = useLocalDateControls({
    longitude,
    timeOfDay: 19
  })
  const { correctAltitude, photometric } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      photometric: true
    },
    { collapsed: true }
  )
  const { useEnvMap, showIrradianceMask, disableMask } = useControls(
    'rendering',
    {
      useEnvMap: true,
      showIrradianceMask: false,
      disableMask: false
    }
  )

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useEffect(() => {
    if (atmosphere == null) {
      return
    }
    // Offset the ellipsoid so that the world space origin locates at the
    // position relative to the ellipsoid.
    geodetic.set(radians(longitude), radians(latitude), height)
    geodetic.toECEF(position)
    atmosphere.ellipsoidCenter.copy(position).multiplyScalar(-1)

    // Rotate the ellipsoid around the world space origin so that the camera's
    // orientation aligns with X: north, Y: up, Z: east, for example.
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up)
    atmosphere.ellipsoidMatrix.makeBasis(north, up, east).invert()
  }, [atmosphere])

  useFrame(() => {
    if (atmosphere != null) {
      atmosphere.updateByDate(new Date(motionDate.get()))
    }
  })

  const envMapParentRef = useRef<Group>(null)
  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  const scene = useThree(({ scene }) => scene)
  useEffect(() => {
    scene.environment = useEnvMap ? (envMap?.fbo.texture ?? null) : null
  }, [useEnvMap, envMap, scene])

  const iss = useGLTF('assets/iss.glb')
  useEffect(() => {
    iss.scene.traverse(object => {
      object.layers = layers
      object.receiveShadow = true
      object.castShadow = true
    })
  }, [iss])

  const effectRef = useRef<AerialPerspectiveEffect>(null)
  useEffect(() => {
    const effect = effectRef.current
    if (effect == null) {
      return
    }
    if (showIrradianceMask) {
      effect.defines.set('DEBUG_SHOW_IRRADIANCE_MASK', '1')
    } else {
      effect.defines.delete('DEBUG_SHOW_IRRADIANCE_MASK')
    }
    ;(effect as any).setChanged()
  }, [showIrradianceMask])

  return (
    <Atmosphere
      ref={setAtmosphere}
      textures='atmosphere'
      correctAltitude={correctAltitude}
      photometric={photometric}
    >
      <OrbitControls />

      {/* Background objects and light sources */}
      <Sky />
      {/* TODO: <Stars data='atmosphere/stars.bin' /> */}
      <SunLight
        distance={80}
        castShadow
        shadow-normalBias={1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={60}
          bottom={-60}
          left={-60}
          right={60}
          near={0}
          far={160}
        />
      </SunLight>
      {/* Sky light must be turned off when using an environment map. */}
      {!useEnvMap && <SkyLight />}

      {/* Quantized mesh terrain */}
      <TilesRenderer
        // The root URL sometimes becomes null without specifying the URL.
        url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY}`}
      >
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
            autoRefreshToken: true
          }}
        />
        <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
        <TilesPlugin
          plugin={TileCreasedNormalsPlugin}
          args={{ creaseAngle: radians(30) }}
        />
        <TilesPlugin plugin={UpdateOnChangePlugin} />
        <TilesPlugin
          plugin={ReorientationPlugin}
          args={{
            lon: radians(longitude),
            lat: radians(latitude),
            height
          }}
        />
        <TilesAttributionOverlay />
      </TilesRenderer>

      {/* Scene objects in a ENU frame */}
      <group rotation-x={-Math.PI / 2}>
        <primitive
          object={iss.scene}
          scale={1}
          rotation-x={Math.PI / 2}
          rotation-y={Math.PI / 2}
        />
      </group>

      {/* Off-screen environment map */}
      <group ref={envMapParentRef}>
        <RenderCubeTexture ref={setEnvMap} resolution={64}>
          <Sky
            // Turn off the sun because we already have a sun directional light.
            sun={false}
          />
        </RenderCubeTexture>
      </group>

      {/* Post-processing */}
      <EffectComposer multisampling={0} enableNormalPass>
        <Fragment key={JSON.stringify([disableMask])}>
          {!disableMask && (
            <IrradianceMask selectionLayer={IRRADIANCE_MASK_LAYER} />
          )}
          <AerialPerspective ref={effectRef} sunIrradiance skyIrradiance />
          <LensFlare />
          <ToneMapping mode={toneMappingMode} />
          <SMAA />
          <Dithering />
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <>
    <Canvas
      gl={{
        depth: false,
        logarithmicDepthBuffer: true
      }}
      camera={{ position: [80, 30, 100], near: 10, far: 1e7, fov: 40 }}
      shadows
    >
      <Stats />
      <Scene />
    </Canvas>
    <div
      css={css`
        position: absolute;
        bottom: 16px;
        right: 16px;
        color: white;
        font-size: small;
        letter-spacing: 0.025em;
      `}
    >
      Model:{' '}
      <a
        href='https://science.nasa.gov/resource/international-space-station-3d-model/'
        target='_blank'
        rel='noreferrer'
      >
        International Space Station 3D Model
      </a>{' '}
      by{' '}
      <a href='https://www.nasa.gov/' target='_blank' rel='noreferrer'>
        NASA
      </a>
      .
    </div>
  </>
)

export default Story
