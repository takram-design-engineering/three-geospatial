import { type Meta } from '@storybook/react'

export default {
  title: 'terrain (WIP)/Terrain Tile',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Globe = await import('./TerrainTile-Globe').then(
  module => module.default
)
export const Multiple = await import('./TerrainTile-Multiple').then(
  module => module.default
)
export const Batched = await import('./TerrainTile-Batched').then(
  module => module.default
)
