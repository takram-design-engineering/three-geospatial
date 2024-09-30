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

import { getSunDirectionECEF } from '@geovanni/astronomy'
import {
  Cartographic,
  Ellipsoid,
  LocalFrame,
  radians,
  TilingScheme
} from '@geovanni/core'
import { Depth, EffectComposer, Normal } from '@geovanni/effects'
import { IonTerrain, TerrainTile } from '@geovanni/terrain'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(
  // // Tokyo
  // radians(139.7671),
  // radians(35.6812)

  // Mountain
  radians(138.7274),
  radians(35.3606),
  4500
)
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

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
  const { normal, depth } = useControls('effect', {
    normal: false,
    depth: false
  })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    }
  })

  const effects = useMemo(
    () => (
      <>
        <AerialPerspective ref={aerialPerspectiveRef} />
        <Normal
          blendFunction={normal ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <Depth
          useTurbo
          blendFunction={depth ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <ToneMapping
          mode={ToneMappingMode.ACES_FILMIC}
          blendFunction={
            !normal && !depth ? BlendFunction.NORMAL : BlendFunction.SKIP
          }
        />
        <SMAA />
      </>
    ),
    [normal, depth]
  )

  return (
    <>
      <OrbitControls target={position} minDistance={1000} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Atmosphere ref={atmosphereRef} renderOrder={-1} />
      <ambientLight intensity={2} />
      <Sphere args={[Ellipsoid.WGS84.minimumRadius, 360, 180]} receiveShadow>
        <meshStandardMaterial color='black' />
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
      <EffectComposer normalPass multisampling={0}>
        {effects}
      </EffectComposer>
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
        logarithmicDepthBuffer: true,
        toneMappingExposure: exposure
      }}
      camera={{ near: 1, far: 1e8, position, up }}
    >
      <Scene />
    </Canvas>
  )
}
