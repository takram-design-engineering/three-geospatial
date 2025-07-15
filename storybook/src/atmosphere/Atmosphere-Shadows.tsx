/// <reference types="vite/types/importMeta.d.ts" />

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import {
  CesiumIonAuthPlugin,
  GLTFCesiumRTCExtension,
  GLTFExtensionsPlugin
} from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type FC
} from 'react'
import { MeshBasicMaterial, MeshLambertMaterial } from 'three'
import {
  DRACOLoader,
  GLTFLoader,
  KTXLoader,
  type GLTFLoaderPlugin
} from 'three-stdlib'

import type { AerialPerspectiveEffect } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  SceneShadow,
  Sky,
  SkyLight,
  Stars,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

const gltfLoader = new GLTFLoader()
gltfLoader.register(() => new GLTFCesiumRTCExtension() as GLTFLoaderPlugin)
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const ktx2loader = new KTXLoader()

const geodetic = new Geodetic(radians(139.7671), radians(35.6812), 0)
const position = geodetic.toECEF()

const basicMaterial = new MeshBasicMaterial({ color: 0x999999 })
const lambertMaterial = new MeshLambertMaterial({ color: 0x999999 })

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
    },
    { collapsed: true }
  )
  const { mode, sun, sky } = useControls('lighting', {
    mode: {
      options: ['post-process', 'light-source'] as const
    },
    sun: true,
    sky: true
  })
  const { enabled: sceneShadow, showShadowMap } = useControls('scene shadow', {
    enabled: true,
    showShadowMap: false
  })
  const { enabled: screenSpaceShadow } = useControls('screen space shadow', {
    enabled: false
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

  const [aerialPerspective, setAerialPerspective] =
    useState<AerialPerspectiveEffect | null>(null)
  useEffect(() => {
    if (aerialPerspective != null) {
      if (showShadowMap) {
        aerialPerspective.defines.set('DEBUG_SHOW_SCENE_SHADOW_MAP', '1')
      } else {
        aerialPerspective.defines.delete('DEBUG_SHOW_SCENE_SHADOW_MAP')
      }
      ;(aerialPerspective as any).setChanged()
    }
  }, [showShadowMap, aerialPerspective])

  return (
    <Atmosphere
      ref={atmosphereRef}
      correctAltitude={correctAltitude}
      ground={false}
    >
      <OrbitControls ref={setControls} />

      {/* Background objects and light sources */}
      <Sky />
      <Stars data='atmosphere/stars.bin' />
      <group position={position}>
        {sky && <SkyLight />}
        {sun && <SunLight />}
      </group>
      {sceneShadow && <SceneShadow mapSize={2048} maxFar={5000} margin={200} />}

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
            material: mode === 'light-source' ? lambertMaterial : basicMaterial,
            receiveShadow: true,
            castShadow: true
          }}
        />
      </TilesRenderer>

      {/* Buildings */}
      {[
        'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json',
        'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json',
        'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13103_minato-ku_2020_bldg_notexture/tileset.json'
      ].map(url => (
        <TilesRenderer key={url} url={url}>
          <TilesPlugin
            key={mode}
            plugin={TileMeshPropsPlugin}
            args={{
              material:
                mode === 'light-source' ? lambertMaterial : basicMaterial,
              receiveShadow: true,
              castShadow: true
            }}
          />
          <TilesPlugin
            plugin={GLTFExtensionsPlugin}
            dracoLoader={dracoLoader}
            ktxLoader={ktx2loader}
            rtc
          />
        </TilesRenderer>
      ))}

      {/* Post-processing */}
      {useMemo(
        () => (
          <EffectComposer multisampling={0}>
            <Fragment
              // Effects are order-dependant; we need to reconstruct the nodes.
              key={JSON.stringify([enabled, mode, lensFlare, normal, depth])}
            >
              {depth && <Depth useTurbo />}
              {normal && <Normal />}
              {!depth && !normal && (
                <>
                  {enabled && (
                    <AerialPerspective
                      ref={setAerialPerspective}
                      sunLight={mode === 'post-process' && sun}
                      skyLight={mode === 'post-process' && sky}
                      transmittance={transmittance}
                      inscatter={inscatter}
                      screenSpaceShadow={screenSpaceShadow}
                    />
                  )}
                  {!showShadowMap && (
                    <>
                      <N8AO intensity={3} aoRadius={20} />
                      {lensFlare && <LensFlare />}
                      <ToneMapping mode={toneMappingMode} />
                      <SMAA />
                      <Dithering />
                    </>
                  )}
                </>
              )}
            </Fragment>
          </EffectComposer>
        ),
        [
          depth,
          enabled,
          inscatter,
          lensFlare,
          mode,
          normal,
          screenSpaceShadow,
          showShadowMap,
          sky,
          sun,
          toneMappingMode,
          transmittance
        ]
      )}
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      depth: false,
      logarithmicDepthBuffer: true
    }}
    camera={{ near: 10, far: 1e6 }}
    shadows
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
