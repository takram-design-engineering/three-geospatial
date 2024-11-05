import { type Meta } from '@storybook/react'

export default {
  title: 'core/Ellipsoid',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export { EastNorthUp } from './Ellipsoid-EastNorthUp'
export { OsculatingSphere } from './Ellipsoid-OsculatingSphere'
