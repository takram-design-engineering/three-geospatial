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
import { SMAAPreset, ToneMappingMode } from 'postprocessing'
import { Suspense, useMemo, useRef, type FC } from 'react'
import { Matrix4, MeshStandardMaterial, Vector3 } from 'three'

import {
  Cartographic,
  Ellipsoid,
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  isNotFalse,
  radians,
  TilingScheme
} from '@geovanni/core'
import { Depth, EffectComposer, LensFlare, Normal } from '@geovanni/effects'
import { LocalFrame, useRendererControls } from '@geovanni/react'
import { IonTerrain, TerrainTile } from '@geovanni/terrain'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { Stars, type StarsImpl } from '../../Stars'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(radians(138.731), radians(35.363), 4500)
const position = location.toVector()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.cartographicToTile(location, 7)
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

const terrainMaterial = new MeshStandardMaterial({ color: 'gray' })

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })

  const { normal, depth, depthNormal } = useControls('effect', {
    depth: false,
    normal: false,
    depthNormal: false
  })

  const motionDate = useMotionDate()
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
        {[
          !normal && !depth && !depthNormal && (
            <AerialPerspective
              key='aerialPerspective'
              ref={aerialPerspectiveRef}
            />
          ),
          <LensFlare key='lensFlare' />,
          depth && <Depth key='Depth' useTurbo />,
          (normal || depthNormal) && (
            <Normal key='normal' reconstructFromDepth={depthNormal} />
          ),
          !normal && !depth && !depthNormal && (
            <ToneMapping key='toneMapping' mode={ToneMappingMode.AGX} />
          ),
          <SMAA key='smaa' preset={SMAAPreset.ULTRA} />
        ].filter(isNotFalse)}
      </EffectComposer>
    ),
    [normal, depth, depthNormal]
  )

  return (
    <>
      <OrbitControls target={position} minDistance={1e3} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} />
      <Stars ref={starsRef} />
      <ambientLight intensity={2} />
      <Sphere
        args={[location.clone().setHeight(0).toVector().length(), 360, 180]}
        receiveShadow
      >
        <meshStandardMaterial color='gray' />
      </Sphere>
      <LocalFrame location={location}>
        <TorusKnot args={[200, 60, 256, 64]} position={[0, 0, 20]}>
          <meshStandardMaterial color='white' />
        </TorusKnot>
      </LocalFrame>
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
