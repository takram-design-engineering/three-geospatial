import { CameraControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type Meta, type StoryObj } from '@storybook/react'
import { suspend } from 'suspend-react'

import { FlatTerrainTile } from './FlatTerrainTile'
import { IonTerrain } from './IonTerrain'
import { TerrainTile } from './TerrainTile'

export default {
  title: 'terrain/TerrainTile'
} satisfies Meta

const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

export const Flat: StoryObj = {
  render: () => {
    const size = 200
    return (
      <Canvas
        camera={{
          near: 0.1,
          far: 1000,
          position: [0, -100, 200],
          up: [0, 0, 1]
        }}
      >
        <CameraControls dollySpeed={0.1} />
        <FlatTerrainTile
          terrain={terrain}
          x={1}
          y={0}
          z={0}
          position={[-size * 0.5, -size * 0.5, 0]}
          scale={[size, size, 1]}
          heightScale={(1 / size) * 0.5}
        />
      </Canvas>
    )
  }
}

export const Globe: StoryObj<{ z: number }> = {
  args: {
    z: 3
  },
  argTypes: {
    z: { control: { type: 'number' } }
  },
  render: ({ z }) => {
    const layer = suspend(async () => await terrain.loadLayer(), [])
    const ranges = layer.available[z]
    return (
      <Canvas
        gl={{ logarithmicDepthBuffer: true }}
        camera={{
          near: 1,
          far: 1e8,
          position: [0, -1e7, 1e7],
          up: [0, 0, 1]
        }}
      >
        <CameraControls dollySpeed={0.1} />
        <GizmoHelper alignment='top-left'>
          <GizmoViewport />
        </GizmoHelper>
        {ranges.map(range => {
          const xCount = range.endX - range.startX + 1
          const yCount = range.endY - range.startY + 1
          return Array.from({ length: xCount }).map((_, index) => {
            const x = range.startX + index
            return Array.from({ length: yCount }).map((_, index) => {
              const y = range.startY + index
              return (
                <TerrainTile
                  key={`${x}:${y}:${z}`}
                  terrain={terrain}
                  x={x}
                  y={y}
                  z={z}
                />
              )
            })
          })
        })}
      </Canvas>
    )
  }
}
