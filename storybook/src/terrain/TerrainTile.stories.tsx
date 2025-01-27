import { type Meta } from '@storybook/react'

import _Batched from './TerrainTile-Batched'
import _Globe from './TerrainTile-Globe'
import _Multiple from './TerrainTile-Multiple'

export default {
  title: 'terrain (WIP)/Terrain Tile',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Globe = _Globe
export const Multiple = _Multiple
export const Batched = _Batched
