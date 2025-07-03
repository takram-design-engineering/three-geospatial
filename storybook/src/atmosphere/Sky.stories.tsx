import type { Meta } from '@storybook/react-vite'

import _Basic from './Sky-Basic'
import _EnvironmentMap from './Sky-EnvironmentMap'

export default {
  title: 'atmosphere/Sky',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const Basic = _Basic
export const EnvironmentMap = _EnvironmentMap
