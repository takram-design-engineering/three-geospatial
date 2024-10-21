import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { Suspense, type FC } from 'react'
import { MeshNormalMaterial } from 'three'

import { Ellipsoid, Geodetic, radians, TilingScheme } from '@geovanni/core'

import { IonTerrain } from '../IonTerrain'
import { TerrainTile } from '../react/TerrainTile'

const location = new Geodetic(radians(138.731), radians(35.363), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const tiles = Array.from(tile.traverseChildren(5))

const terrainMaterial = new MeshNormalMaterial()

const Scene: FC = () => {
  return (
    <>
      <OrbitControls target={position} minDistance={1e4} />
      <GizmoHelper alignment='top-left' renderPriority={1}>
        <GizmoViewport />
      </GizmoHelper>
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
    </>
  )
}

export const Multiple: StoryFn = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      camera={{ near: 100, far: 1e6, position, up }}
    >
      <Scene />
    </Canvas>
  )
}
