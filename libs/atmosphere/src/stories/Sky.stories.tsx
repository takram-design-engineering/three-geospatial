import { type Meta } from '@storybook/react'

export default {
  title: 'atmosphere/Sky',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { Basic } from './Sky-Basic'
export { EnvMap } from './Sky-EnvMap'
