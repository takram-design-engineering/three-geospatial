import type { Meta } from '@storybook/react-vite'

import _PointOfView from './Camera-PointOfView'

export default {
  title: 'core/Camera',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const PointOfView = _PointOfView
