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

const geodetic = new Geodetic(radians(138.731), radians(35.363))
const position = geodetic.toECEF()

const terrain = new IonTerrain({
  assetId: 2767062, // Japan Regional Terrain
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})
const tile = new TilingScheme().getTile(geodetic, 7)

const Scene: FC = () => {
  const { camera } = useThree()
  const [controls, setControls] = useState<ComponentRef<
    typeof OrbitControls
  > | null>(null)

  useEffect(() => {
    const pov = new PointOfView(20000, radians(110), radians(-50))
    pov.decompose(position, camera.position, camera.quaternion, camera.up)
    if (controls != null) {
      controls.target.copy(position)
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
