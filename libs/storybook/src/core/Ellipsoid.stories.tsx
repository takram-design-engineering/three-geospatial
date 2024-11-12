import { type Meta } from '@storybook/react'

export default {
  title: 'core/Ellipsoid',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const EastNorthUp = await import('./Ellipsoid-EastNorthUp').then(
  module => module.default
)
export const OsculatingSphere = await import(
  './Ellipsoid-OsculatingSphere'
).then(module => module.default)
