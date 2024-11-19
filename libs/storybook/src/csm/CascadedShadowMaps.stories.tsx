import { type Meta } from '@storybook/react'

export default {
  title: 'csm/Cascaded Shadow Maps',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = await import('./CascadedShadowMaps-Basic').then(
  module => module.default
)
