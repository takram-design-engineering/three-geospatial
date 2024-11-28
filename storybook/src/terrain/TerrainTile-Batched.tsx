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

import {
  Geodetic,
  PointOfView,
  radians,
  TilingScheme
} from '@takram/three-geospatial'
import { IonTerrain } from '@takram/three-terrain'
import { BatchedTerrainTile } from '@takram/three-terrain/r3f'

const location = new Geodetic(radians(138.731), radians(35.363))
const position = location.toECEF()

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

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
      camera={{ near: 100, far: 1e6 }}
    >
      <Scene />
    </Canvas>
  )
}

export default Story
