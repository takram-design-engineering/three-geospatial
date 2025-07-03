import type { Meta } from '@storybook/react-vite'

import _EastNorthUp from './Ellipsoid-EastNorthUp'
import _OsculatingSphere from './Ellipsoid-OsculatingSphere'

export default {
  title: 'core/Ellipsoid',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const EastNorthUp = _EastNorthUp
export const OsculatingSphere = _OsculatingSphere
