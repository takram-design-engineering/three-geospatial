import { CameraControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type Meta, type StoryFn } from '@storybook/react'
import { Suspense } from 'react'
import { suspend } from 'suspend-react'

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
  const size = 200
  return (
    <Canvas camera={{ position: [0, -100, 200], up: [0, 0, 1] }}>
      <CameraControls dollySpeed={0.1} />
      <TerrainTile
        terrain={terrain}
        x={0}
        y={0}
        z={0}
        position={[-size * 0.5, -size * 0.5, 0]}
        scale={[size, size, size * 0.5]}
      />
    </Canvas>
  )
}

export const Many: StoryFn = () => {
  const z = 2
  const size = 50
  const layer = suspend(async () => await terrain.loadLayer(), [])
  const [range] = layer.available[z]
  const xCount = range.endX - range.startX + 1
  const yCount = range.endY - range.startY + 1
  return (
    <Canvas camera={{ position: [0, -100, 200], up: [0, 0, 1] }}>
      <CameraControls dollySpeed={0.1} />
      <Suspense>
        {Array.from({ length: xCount }).map((_, index) => {
          const x = range.startX + index
          return Array.from({ length: yCount }).map((_, index) => {
            const y = range.startY + index
            return (
              <TerrainTile
                key={`${x}:${y}`}
                terrain={terrain}
                x={x}
                y={y}
                z={z}
                position={[
                  -size * 0.5 * xCount + size * x,
                  -size * 0.5 * yCount + size * y,
                  0
                ]}
                scale={[size, size, size * 0.5]}
              />
            )
          })
        })}
      </Suspense>
    </Canvas>
  )
}
