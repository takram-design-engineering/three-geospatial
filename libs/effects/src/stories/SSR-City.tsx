import { OrbitControls, useTexture } from '@react-three/drei'
import { applyProps, Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { GLTFCesiumRTCExtension, TilesRenderer } from '3d-tiles-renderer'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  LinearSRGBColorSpace,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  type Object3D
} from 'three'
import { GLTFLoader, type GLTFLoaderPlugin } from 'three-stdlib'

import { Ellipsoid, Geodetic, radians, TilingScheme } from '@geovanni/core'
import { EastNorthUpFrame } from '@geovanni/core/react'
import { IonTerrain } from '@geovanni/terrain'
import { BatchedTerrainTile } from '@geovanni/terrain/react'

import { Dithering, LensFlare } from '../react'
import { EffectComposer } from '../react/EffectComposer'
import { SSR } from '../react/SSR'
import { type SSREffect } from '../SSREffect'

const gltfLoader = new GLTFLoader()
gltfLoader.register(() => new GLTFCesiumRTCExtension() as GLTFLoaderPlugin)

const buildingMaterial = new MeshPhysicalMaterial({
  metalness: 0,
  roughness: 1
})

// Coordinates of Tokyo station.
const location = new Geodetic(radians(139.7671), radians(35.6812), 36.6624)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)
const cameraPosition = position.clone().add(up.clone().multiplyScalar(2000))

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 8)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

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

const Scene: FC = () => {
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

  const { enabled, maxSteps, maxDistance, thickness } = useControls({
    enabled: true,
    maxSteps: {
      value: 500,
      min: 0,
      max: 1000
    },
    maxDistance: {
      value: 100,
      min: 0,
      max: 1000
    },
    thickness: {
      value: 0.01,
      min: 0,
      max: 1
    }
  })

  const ssrRef = useRef<SSREffect | null>(null)
  if (ssrRef.current != null) {
    applyProps(ssrRef.current, { maxSteps, maxDistance, thickness })
  }

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} multisampling={0}>
        {enabled && <SSR ref={ssrRef} />}
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    ),
    [enabled]
  )

  const normalMap = useTexture('/normal_noise.png')
  normalMap.colorSpace = LinearSRGBColorSpace
  normalMap.repeat.set(500, 500)
  normalMap.wrapS = RepeatWrapping
  normalMap.wrapT = RepeatWrapping

  const terrainMaterial = useMemo(() => {
    const material = new MeshPhysicalMaterial({
      color: 'gray',
      metalness: 0.2,
      roughness: 0.1
    })
    return material
  }, [])

  const [target, setTarget] = useState<Object3D | null>(null)
  return (
    <>
      <color attach='background' args={[50, 50, 50]} />
      <fogExp2 attach='fog' color='white' density={0.00005} />
      <OrbitControls target={position} />
      <ambientLight intensity={0.02} />
      <EastNorthUpFrame {...location}>
        <object3D ref={setTarget} />
        <directionalLight
          position={[500, 1000, 1000]}
          intensity={0.4}
          target={target ?? undefined}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-intensity={0.5}
        >
          <orthographicCamera
            attach='shadow-camera'
            args={[-2500, 2500, 2500, -2500, 1, 5000]}
          />
        </directionalLight>
      </EastNorthUpFrame>
      {renderers.map((renderer, index) => (
        <primitive key={index} object={renderer.group} />
      ))}
      <Suspense>
        <BatchedTerrainTile
          terrain={terrain}
          {...tile}
          depth={5}
          computeVertexNormals
          material={terrainMaterial}
          castShadow
          receiveShadow
        />
      </Suspense>
      {effectComposer}
    </>
  )
}

export const City: StoryFn = () => {
  return (
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
        far: 1e8,
        position: cameraPosition,
        up
      }}
    >
      <Scene />
    </Canvas>
  )
}
