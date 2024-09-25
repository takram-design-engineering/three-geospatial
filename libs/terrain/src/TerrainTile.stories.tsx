import { CameraControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type Meta, type StoryFn } from '@storybook/react'
import { Suspense } from 'react'

import { IonTerrain } from './IonTerrain'
import { TerrainTile } from './TerrainTile'

export default {
  title: 'terrain/TerrainTile'
} satisfies Meta

const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

export const Basic: StoryFn = () => {
  return (
    <Canvas camera={{ position: [0, -100, 200], up: [0, 0, 1] }}>
      <CameraControls dollySpeed={0.1} />
      <Suspense>
        <TerrainTile
          terrain={terrain}
          x={0}
          y={0}
          z={0}
          position={[-100, -100, 0]}
          scale={[200, 200, 100]}
        />
      </Suspense>
    </Canvas>
  )
}
