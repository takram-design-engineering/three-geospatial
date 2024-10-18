import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere,
  TorusKnot
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useMemo, useRef, type FC } from 'react'
import { Matrix4, MeshBasicMaterial, Vector3 } from 'three'

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
  Depth,
  EffectComposer,
  LensFlare,
  Normal,
  useColorGradingControls
} from '@geovanni/effects'
import { LocalTangentFrame } from '@geovanni/react'
import { IonTerrain, TerrainTile } from '@geovanni/terrain'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { Stars, type StarsImpl } from '../../Stars'
import { useLocalDateControls } from '../useLocalDateControls'
import { useRendererControls } from '../useRendererControls'

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

const material = new MeshBasicMaterial({ color: 'white' })
const terrainMaterial = new MeshBasicMaterial({ color: 'gray' })

const Scene: FC = () => {
  const { photometric } = useRendererControls({
    photometric: true,
    exposure: 10
  })
  const lut = useColorGradingControls()

  const { lensFlare, normal, depth } = useControls('effects', {
    lensFlare: true,
    depth: false,
    normal: false
  })

  const { enable, sunIrradiance, skyIrradiance, transmittance, inscatter } =
    useControls('aerial perspective', {
      enable: true,
      sunIrradiance: true,
      skyIrradiance: true,
      transmittance: true,
      inscatter: true
    })

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const rotationMatrixRef = useRef(new Matrix4())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)
  const starsRef = useRef<StarsImpl>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    getECIToECEFRotationMatrix(date, rotationMatrixRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (starsRef.current != null) {
      starsRef.current.material.sunDirection = sunDirectionRef.current
      starsRef.current.setRotationFromMatrix(rotationMatrixRef.current)
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    }
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} normalPass multisampling={0}>
        {enable && !normal && !depth && (
          <AerialPerspective
            ref={aerialPerspectiveRef}
            photometric={photometric}
            sunIrradiance={sunIrradiance}
            skyIrradiance={skyIrradiance}
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
          </>
        )}
      </EffectComposer>
    ),
    [
      photometric,
      enable,
      sunIrradiance,
      skyIrradiance,
      transmittance,
      inscatter,
      lensFlare,
      normal,
      depth,
      lut
    ]
  )

  return (
    <>
      <OrbitControls target={position} minDistance={1e3} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} photometric={photometric} />
      <Stars ref={starsRef} />
      <Sphere
        args={[location.clone().setHeight(0).toECEF().length(), 360, 180]}
        material={terrainMaterial}
        receiveShadow
      />
      <LocalTangentFrame location={location}>
        <TorusKnot
          args={[200, 60, 256, 64]}
          position={[0, 0, 20]}
          material={material}
        />
      </LocalTangentFrame>
      {tiles.map(tile => (
        <Suspense key={`${tile.x}:${tile.y}:${tile.z}`}>
          <TerrainTile
            terrain={terrain}
            {...tile}
            computeVertexNormals
            material={terrainMaterial}
          />
        </Suspense>
      ))}
      {effectComposer}
    </>
  )
}

export const Basic: StoryFn = () => {
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
      <Scene />
    </Canvas>
  )
}
