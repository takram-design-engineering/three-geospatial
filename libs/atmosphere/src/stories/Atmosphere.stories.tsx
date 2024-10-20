import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './Atmosphere-Basic'
export { SkyBox } from './Atmosphere-SkyBox'
