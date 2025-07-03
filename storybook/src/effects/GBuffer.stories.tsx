import type { Meta } from '@storybook/react-vite'

import _Basic from './GBuffer-Basic'

export default {
  title: 'effects/G-Buffer',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
