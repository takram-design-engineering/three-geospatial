import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  RenderCubeTexture,
  TorusKnot,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC
} from 'react'
import {
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3
} from 'three'

import {
  Ellipsoid,
  Geodetic,
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  radians,
  TilingScheme
} from '@geovanni/core'
import {
  Ellipsoid as EllipsoidMesh,
  LocalTangentFrame
} from '@geovanni/core/react'
import { CascadedDirectionalLights, CSM, useCSM } from '@geovanni/csm/react'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal,
  useColorGradingControls
} from '@geovanni/effects/react'
import { IonTerrain } from '@geovanni/terrain'
import { TerrainTile } from '@geovanni/terrain/react'

import { type AerialPerspectiveEffect } from '../AerialPerspectiveEffect'
import { computeSunLightColor } from '../computeSunLightColor'
import { AerialPerspective } from '../react/AerialPerspective'
import { Atmosphere, type AtmosphereImpl } from '../react/Atmosphere'
import { SkyRadiance } from '../react/SkyRadiance'
import { Stars, type StarsImpl } from '../react/Stars'
import { usePrecomputedTextures } from '../react/usePrecomputedTextures'
import { useLocalDateControls } from './helpers/useLocalDateControls'
import { useRendererControls } from './helpers/useRendererControls'

const location = new Geodetic(radians(138.731), radians(35.363), 4500)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const tiles = tile
  .getChildren()
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())

const basicMaterial = new MeshBasicMaterial({ color: 'white' })
const terrainBasicMaterial = new MeshBasicMaterial({ color: 'gray' })

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
  const lut = useColorGradingControls()

  const { lensFlare, normal, depth } = useControls('effects', {
    lensFlare: true,
    depth: false,
    normal: false
  })

  const { osculateEllipsoid, photometric } = useControls('atmosphere', {
    osculateEllipsoid: true,
    photometric: true
  })

  const { mode, shadow, sun, sky } = useControls('lighting', {
    mode: {
      options: ['forward', 'deferred'] as const
    },
    shadow: true,
    sun: true,
    sky: true
  })

  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    gl.shadowMap.enabled = shadow
    scene.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        child.material.needsUpdate = true
      }
    })
  }, [shadow, gl, scene])

  const { enabled, transmittance, inscatter } = useControls(
    'aerial perspective',
    {
      enabled: true,
      transmittance: true,
      inscatter: true
    }
  )

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const rotationMatrixRef = useRef(new Matrix4())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)
  const envMapRef = useRef<AtmosphereImpl>(null)
  const starsRef = useRef<StarsImpl>(null)

  const csm = useCSM()
  const standardMaterial = useMemo(
    () =>
      csm.setupMaterial(
        new MeshStandardMaterial({
          color: 'white'
        })
      ),
    [csm]
  )
  const terrainStandardMaterial = useMemo(
    () =>
      csm.setupMaterial(
        new MeshStandardMaterial({
          color: 'gray'
        })
      ),
    [csm]
  )

  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  useEffect(() => {
    scene.environment = envMap?.fbo.texture ?? null
    scene.environmentIntensity = mode === 'forward' && sky ? 1 : 0
  }, [envMap, scene, mode, sky])

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    getECIToECEFRotationMatrix(date, rotationMatrixRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (envMapRef.current != null) {
      envMapRef.current.material.sunDirection = sunDirectionRef.current
      envMapRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (starsRef.current != null) {
      starsRef.current.material.sunDirection = sunDirectionRef.current
      starsRef.current.setRotationFromMatrix(rotationMatrixRef.current)
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    }
    csm.directionalLights.direction
      .copy(sunDirectionRef.current)
      .multiplyScalar(-1)
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} normalPass multisampling={0}>
        {enabled && !normal && !depth && (
          <AerialPerspective
            ref={aerialPerspectiveRef}
            osculateEllipsoid={osculateEllipsoid}
            photometric={photometric}
            sunIrradiance={mode === 'deferred' && sun}
            skyIrradiance={mode === 'deferred' && sky}
            transmittance={transmittance}
            inscatter={inscatter}
          />
        )}
        {lensFlare && <LensFlare />}
        {depth && <Depth useTurbo />}
        {normal && <Normal />}
        {!normal && !depth && (
          <>
            <ToneMapping mode={ToneMappingMode.AGX} />
            {lut != null && lut}
            <SMAA />
            <Dithering />
          </>
        )}
      </EffectComposer>
    ),
    [
      osculateEllipsoid,
      photometric,
      mode,
      sun,
      sky,
      enabled,
      transmittance,
      inscatter,
      lensFlare,
      normal,
      depth,
      lut
    ]
  )

  const textures = usePrecomputedTextures('/', true)
  useFrame(() => {
    computeSunLightColor(
      textures.transmittanceTexture,
      position,
      sunDirectionRef.current,
      { osculateEllipsoid, photometric },
      csm.directionalLights.mainLight.color
    )
  })

  const [material, terrainMaterial] = {
    forward: [standardMaterial, terrainStandardMaterial],
    deferred: [basicMaterial, terrainBasicMaterial]
  }[mode]

  return (
    <>
      <OrbitControls target={position} minDistance={1e3} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere
        ref={atmosphereRef}
        osculateEllipsoid={osculateEllipsoid}
        photometric={photometric}
      />
      <Stars ref={starsRef} osculateEllipsoid={osculateEllipsoid} />
      <CascadedDirectionalLights
        intensity={mode === 'forward' && sun ? 1 : 0}
      />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 360, 180]}
        material={terrainMaterial}
        receiveShadow
      />
      <LocalTangentFrame location={location}>
        <TorusKnot
          args={[200, 60, 256, 64]}
          position={[0, 0, 20]}
          material={material}
          receiveShadow
          castShadow
        />
        <material>
          <RenderCubeTexture
            ref={setEnvMap}
            resolution={64}
            position={position}
          >
            <SkyRadiance
              ref={envMapRef}
              osculateEllipsoid={osculateEllipsoid}
              photometric={photometric}
            />
          </RenderCubeTexture>
        </material>
      </LocalTangentFrame>
      {tiles.map(tile => (
        <Suspense key={`${tile.x}:${tile.y}:${tile.z}`}>
          <TerrainTile
            terrain={terrain}
            {...tile}
            computeVertexNormals
            material={terrainMaterial}
            receiveShadow
            castShadow
          />
        </Suspense>
      ))}
      {effectComposer}
    </>
  )
}

export const ForwardLighting: StoryFn = () => {
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        logarithmicDepthBuffer: true
      }}
      camera={{ near: 100, far: 1e6, position, up }}
    >
      <CSM far={1e5} margin={7000} mapSize={4096}>
        <Scene />
      </CSM>
    </Canvas>
  )
}
