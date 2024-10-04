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
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { Suspense, useMemo, useRef, type FC } from 'react'
import { MeshStandardMaterial, Vector3 } from 'three'

import { getMoonDirectionECEF, getSunDirectionECEF } from '@geovanni/astronomy'
import { Depth, EffectComposer, Normal } from '@geovanni/effects'
import {
  Cartographic,
  Ellipsoid,
  LocalFrame,
  radians,
  TilingScheme
} from '@geovanni/math'
import { IonTerrain, TerrainTile } from '@geovanni/terrain'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(radians(138.731), radians(35.363), 4500)
const position = location.toVector()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.cartographicToTile(location, 12)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const tiles = tile
  .getParent()
  .getParent()
  .getParent()
  .getParent()
  .getParent()
  .getChildren()
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())
  .flatMap(tile => tile.getChildren())

const terrainMaterial = new MeshStandardMaterial({ color: 'gray' })

const Scene: FC = () => {
  const { normal, depth, depthNormal } = useControls('effect', {
    depth: false,
    normal: false,
    depthNormal: false
  })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    getMoonDirectionECEF(new Date(motionDate.get()), moonDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    }
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} normalPass multisampling={0}>
        <AerialPerspective ref={aerialPerspectiveRef} />
        <Depth
          useTurbo
          blendFunction={depth ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <Normal
          reconstructFromDepth={depthNormal}
          blendFunction={
            normal || depthNormal ? BlendFunction.NORMAL : BlendFunction.SKIP
          }
        />
        <ToneMapping
          mode={ToneMappingMode.ACES_FILMIC}
          blendFunction={
            !normal && !depth && !depthNormal
              ? BlendFunction.NORMAL
              : BlendFunction.SKIP
          }
        />
        <SMAA />
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
      <Atmosphere ref={atmosphereRef} renderOrder={-1} />
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
  const { exposure } = useControls('gl', {
    exposure: { value: 10, min: 0, max: 100 }
  })
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        logarithmicDepthBuffer: true,
        toneMappingExposure: exposure
      }}
      camera={{ near: 100, far: 1e6, position, up }}
    >
      <Scene />
    </Canvas>
  )
}
