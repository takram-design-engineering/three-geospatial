import { CameraControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { Suspense, useEffect, useState } from 'react'
import { suspend } from 'suspend-react'
import { MeshNormalMaterial } from 'three'

import { IonTerrain } from '../../IonTerrain'
import { OctNormalMaterial } from '../../OctNormalMaterial'
import { TerrainTile } from '../../TerrainTile'

const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

export const Globe: StoryFn<{
  z: number
  useOctNormal: boolean
  flatShading: boolean
}> = ({ z, useOctNormal, flatShading }) => {
  const layer = suspend(async () => await terrain.loadLayer(), [Globe])
  const ranges = layer.available[z]

  const [[octNormalMaterial, meshNormalMaterial], setMaterials] = useState(
    () => [
      new OctNormalMaterial({ flatShading }),
      new MeshNormalMaterial({ flatShading })
    ]
  )

  useEffect(() => {
    setMaterials([
      new OctNormalMaterial({ flatShading }),
      new MeshNormalMaterial({ flatShading })
    ])
  }, [flatShading])

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
              <Suspense key={`${x}:${y}:${z}`}>
                <TerrainTile
                  terrain={terrain}
                  x={x}
                  y={y}
                  z={z}
                  computeVertexNormals
                  material={
                    useOctNormal ? octNormalMaterial : meshNormalMaterial
                  }
                />
              </Suspense>
            )
          })
        })
      })}
    </Canvas>
  )
}

Globe.args = {
  z: 3,
  useOctNormal: false,
  flatShading: true
}

Globe.argTypes = {
  z: { control: { type: 'number' } },
  useOctNormal: { control: { type: 'boolean' } },
  flatShading: { control: { type: 'boolean' } }
}
