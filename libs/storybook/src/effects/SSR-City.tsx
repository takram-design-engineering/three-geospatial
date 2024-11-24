import { Circle, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { TilesRenderer } from '3d-tiles-renderer'
import { GLTFCesiumRTCExtension } from '3d-tiles-renderer/plugins'
import { parseISO } from 'date-fns'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  Mesh,
  MeshPhysicalMaterial,
  type DirectionalLight,
  type Object3D
} from 'three'
import { GLTFLoader, type GLTFLoaderPlugin } from 'three-stdlib'

import { computeSunLightColor } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  Dithering,
  EffectComposer,
  LensFlare,
  SSAO,
  SSR
} from '@takram/three-effects/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'

const gltfLoader = new GLTFLoader()
gltfLoader.register(() => new GLTFCesiumRTCExtension() as GLTFLoaderPlugin)

const buildingMaterial = new MeshPhysicalMaterial({
  metalness: 0,
  roughness: 1
})

const location = new Geodetic(radians(139.7671), radians(35.6812), 36.6624)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)
const cameraPosition = position.clone().add(up.clone().multiplyScalar(2000))

function onLoadModel(event: { scene: Object3D }): void {
  event.scene.traverse(object => {
    object.castShadow = true
    object.receiveShadow = true
    if (object instanceof Mesh) {
      object.material = buildingMaterial
    }
  })
}

function createRenderer(url: string): TilesRenderer {
  const tiles = new TilesRenderer(url)
  tiles.manager.addHandler(/\.gltf$/, gltfLoader)
  tiles.addEventListener('load-model', onLoadModel as (event: Object) => void)
  return tiles
}

const Buildings: FC = () => {
  const renderers = useMemo(() => {
    const renderers = [
      'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json',
      'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json',
      'https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13103_minato-ku_2020_bldg_notexture/tileset.json'
    ].map(createRenderer)
    const [mainRenderer] = renderers
    renderers.slice(1).forEach(renderer => {
      renderer.lruCache = mainRenderer.lruCache
      renderer.downloadQueue = mainRenderer.downloadQueue
      renderer.parseQueue = mainRenderer.parseQueue
    })
    return renderers
  }, [])

  useEffect(() => {
    return () => {
      renderers.forEach(renderer => {
        renderer.dispose()
      })
    }
  }, [renderers])

  const { gl, camera } = useThree()

  useEffect(() => {
    renderers.forEach(renderer => {
      renderer.setCamera(camera)
    })
  }, [renderers, camera])

  useEffect(() => {
    renderers.forEach(renderer => {
      renderer.setResolutionFromRenderer(camera, gl)
    })
  }, [renderers, camera, gl])

  useFrame(() => {
    renderers.forEach(renderer => {
      renderer.update()
    })
  })

  return renderers.map((renderer, index) => (
    <primitive key={index} object={renderer.group} />
  ))
}

const Scene: FC = () => {
  const {
    enabled,
    iterations,
    binarySearchIterations,
    pixelZSize,
    pixelStride,
    pixelStrideZCutoff,
    maxRayDistance,
    screenEdgeFadeStart,
    eyeFadeStart,
    eyeFadeEnd,
    jitter
  } = useControls('ssr', {
    enabled: true,
    iterations: { value: 200, min: 0, max: 1000 },
    binarySearchIterations: { value: 4, min: 0, max: 64 },
    pixelZSize: { value: 100, min: 1, max: 100 },
    pixelStride: { value: 5, min: 0, max: 64 },
    pixelStrideZCutoff: { value: 100, min: 0, max: 1000 },
    maxRayDistance: { value: 5000, min: 0, max: 5000 },
    screenEdgeFadeStart: { value: 0.75, min: 0, max: 1 },
    eyeFadeStart: { value: 0, min: 0, max: 1 },
    eyeFadeEnd: { value: 1, min: 0, max: 1 },
    jitter: { value: 1, min: 0, max: 1 }
  })

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  const lightRef = useRef<DirectionalLight>(null)

  useEffect(() => {
    if (atmosphere == null) {
      return
    }
    const date = parseISO('2024-10-31T13:00+09:00')
    atmosphere.updateByDate(date)

    const light = lightRef.current
    if (atmosphere.textures != null && light != null) {
      light.position.copy(atmosphere.sunDirection)
      computeSunLightColor(
        atmosphere.textures.transmittanceTexture,
        position,
        atmosphere.sunDirection,
        light.color
      )
    }
  }, [atmosphere])

  const [target, setTarget] = useState<Object3D | null>(null)
  return (
    <Atmosphere ref={setAtmosphere} texturesUrl='/'>
      <OrbitControls target={position} />
      <Sky />
      <group position={position}>
        <SkyLight />
        <object3D ref={setTarget} />
        <directionalLight
          ref={lightRef}
          intensity={0.4}
          target={target ?? undefined}
          castShadow
          shadow-mapSize={[4096, 4096]}
        >
          <orthographicCamera
            attach='shadow-camera'
            args={[-2500, 2500, 2500, -2500, 1, 5000]}
          />
        </directionalLight>
      </group>
      <EastNorthUpFrame {...location}>
        <Circle args={[1e5]} receiveShadow>
          <meshPhysicalMaterial color={[0.75, 0.75, 0.75]} metalness={0.2} />
        </Circle>
      </EastNorthUpFrame>
      <Buildings />
      <EffectComposer multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            enabled,
            iterations,
            binarySearchIterations,
            pixelZSize,
            pixelStride,
            pixelStrideZCutoff,
            maxRayDistance,
            screenEdgeFadeStart,
            eyeFadeStart,
            eyeFadeEnd,
            jitter
          })}
        >
          <AerialPerspective sunIrradiance={false} skyIrradiance={false} />
          {enabled && (
            <SSR
              iterations={iterations}
              binarySearchIterations={binarySearchIterations}
              pixelZSize={pixelZSize}
              pixelStride={pixelStride}
              pixelStrideZCutoff={pixelStrideZCutoff}
              maxRayDistance={maxRayDistance}
              screenEdgeFadeStart={screenEdgeFadeStart}
              eyeFadeStart={eyeFadeStart}
              eyeFadeEnd={eyeFadeEnd}
              jitter={jitter}
            />
          )}
          <SSAO intensity={3} aoRadius={20} />
          <LensFlare />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
          <Dithering />
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <Canvas
    shadows
    gl={{
      antialias: false,
      depth: false,
      stencil: false,
      logarithmicDepthBuffer: true,
      toneMappingExposure: 10
    }}
    camera={{
      near: 1,
      far: 1e7,
      position: cameraPosition,
      up
    }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
