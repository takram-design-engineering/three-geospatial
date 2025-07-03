import type { Meta } from '@storybook/react-vite'

import _Basic from './Stars-Basic'
import _BlackBodyChromaticity from './Stars-BlackBodyChromaticity'

export default {
  title: 'atmosphere/Stars',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const BlackBodyChromaticity = _BlackBodyChromaticity
