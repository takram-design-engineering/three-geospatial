/// <reference types="vite/types/importMeta.d.ts" />

import { Canvas } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import {
  CesiumIonAuthPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { type FC } from 'react'

import { TerrainTilesPlugin } from '@takram/three-3d-tiles-support'

const Globe: FC = () => {
  return (
    <TilesRenderer>
      <TilesPlugin
        plugin={CesiumIonAuthPlugin}
        args={{
          apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
          assetId: 1,
          autoRefreshToken: true
        }}
      />
      <TilesPlugin plugin={TerrainTilesPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <GlobeControls enableDamping />
    </TilesRenderer>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas
      camera={{
        position: [0, -1e7, 1e7],
        up: [0, 0, 1]
      }}
    >
      <Globe />
    </Canvas>
  )
}

export default Story
