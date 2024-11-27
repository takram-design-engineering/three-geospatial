import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { Suspense, type FC } from 'react'

import {
  Ellipsoid,
  Geodetic,
  radians,
  TilingScheme
} from '@takram/three-geospatial'
import { IonTerrain } from '@takram/three-terrain'
import { BatchedTerrainTile } from '@takram/three-terrain/r3f'

const location = new Geodetic(radians(138.731), radians(35.363), 2000)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const Scene: FC = () => {
  return (
    <>
      <OrbitControls target={position} minDistance={1e4} />
      <GizmoHelper alignment='top-left' renderPriority={1}>
        <GizmoViewport />
      </GizmoHelper>
      <Suspense>
        <BatchedTerrainTile
          terrain={terrain}
          {...tile}
          depth={5}
          computeVertexNormals
        >
          <meshNormalMaterial />
        </BatchedTerrainTile>
      </Suspense>
    </>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      camera={{ near: 100, far: 1e6, position, up }}
    >
      <Scene />
    </Canvas>
  )
}

export default Story
