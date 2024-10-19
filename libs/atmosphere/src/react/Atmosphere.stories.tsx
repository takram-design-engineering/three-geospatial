import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './stories/Atmosphere/Basic'
export { SkyBox } from './stories/Atmosphere/SkyBox'
