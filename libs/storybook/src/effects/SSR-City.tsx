import { Circle, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { GLTFCesiumRTCExtension, TilesRenderer } from '3d-tiles-renderer'
import { parseISO } from 'date-fns'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type DirectionalLight,
  type Group,
  type Object3D
} from 'three'
import { GLTFLoader, type GLTFLoaderPlugin } from 'three-stdlib'

import {
  computeSunLightColor,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  PrecomputedTexturesLoader,
  SkyLight,
  type AerialPerspectiveEffect
} from '@geovanni/atmosphere'
import {
  AerialPerspective,
  Sky,
  type SkyImpl
} from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians } from '@geovanni/core'
import { EastNorthUpFrame } from '@geovanni/core/react'
import {
  Dithering,
  EffectComposer,
  LensFlare,
  SSAO,
  SSR
} from '@geovanni/effects/react'

import { Stats } from '../helpers/Stats'

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

  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const lightRef = useRef<DirectionalLight>(null)
  const skyRef = useRef<SkyImpl>(null)
  const envMapRef = useRef<SkyImpl>(null)
  const envMapParentRef = useRef<Group>(null)
  const [aerialPerspective, setAerialPerspective] =
    useState<AerialPerspectiveEffect | null>(null)

  const textures = useLoader(PrecomputedTexturesLoader, '/')

  useEffect(() => {
    const date = parseISO('2024-10-31T13:00+09:00')
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    if (lightRef.current != null) {
      lightRef.current.position.copy(sunDirectionRef.current)
      computeSunLightColor(
        textures.transmittanceTexture,
        position,
        sunDirectionRef.current,
        lightRef.current.color
      )
    }
    if (skyRef.current != null) {
      skyRef.current.material.sunDirection.copy(sunDirectionRef.current)
      skyRef.current.material.moonDirection.copy(moonDirectionRef.current)
    }
    if (envMapRef.current != null) {
      envMapRef.current.material.sunDirection.copy(sunDirectionRef.current)
    }
    if (aerialPerspective != null) {
      aerialPerspective.sunDirection.copy(sunDirectionRef.current)
    }
    envMapParentRef.current?.position.copy(position)
  }, [aerialPerspective, textures.transmittanceTexture])

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} multisampling={0}>
        <AerialPerspective
          ref={setAerialPerspective}
          sunIrradiance={false}
          skyIrradiance={false}
        />
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
      </EffectComposer>
    ),
    [
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
    ]
  )

  const skyLight = useMemo(() => new SkyLight(), [])
  skyLight.irradianceTexture = textures.irradianceTexture
  useFrame(() => {
    skyLight.position.copy(position)
    skyLight.sunDirection.copy(sunDirectionRef.current)
    skyLight.update(gl)
  })

  const [target, setTarget] = useState<Object3D | null>(null)
  return (
    <>
      <primitive object={skyLight} />
      <Sky ref={skyRef} />
      <OrbitControls target={position} />
      <group position={position}>
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
      {renderers.map((renderer, index) => (
        <primitive key={index} object={renderer.group} />
      ))}
      {effectComposer}
    </>
  )
}

export const City: StoryFn = () => (
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
