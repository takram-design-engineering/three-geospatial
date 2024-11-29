import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import {
  Suspense,
  useEffect,
  useState,
  type ComponentRef,
  type FC
} from 'react'
import { MeshNormalMaterial } from 'three'

import {
  Geodetic,
  PointOfView,
  radians,
  TilingScheme
} from '@takram/three-geospatial'
import { IonTerrain } from '@takram/three-terrain'
import { TerrainTile } from '@takram/three-terrain/r3f'

const geodetic = new Geodetic(radians(138.731), radians(35.363))
const position = geodetic.toECEF()

const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})
const tile = new TilingScheme().getTile(geodetic, 7)
const tiles = Array.from(tile.traverseChildren(5))

const terrainMaterial = new MeshNormalMaterial()

const Scene: FC = () => {
  const { camera } = useThree()
  const [controls, setControls] = useState<ComponentRef<
    typeof OrbitControls
  > | null>(null)

  useEffect(() => {
    const pov = new PointOfView(position, radians(110), radians(-50), 20000)
    pov.decompose(camera.position, camera.quaternion, camera.up)
    if (controls != null) {
      controls.target.copy(pov.target)
      controls.update()
    }
  }, [camera, controls])

  return (
    <>
      <OrbitControls ref={setControls} />
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

const Story: StoryFn = () => {
  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      camera={{ near: 100, far: 1e6 }}
    >
      <Scene />
    </Canvas>
  )
}

export default Story
