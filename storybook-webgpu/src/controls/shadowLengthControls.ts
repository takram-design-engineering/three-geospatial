import type { ArgTypes } from '@storybook/react-vite'

export interface ShadowLengthArgs {
  shadowLength: boolean
  displayShadowLength: boolean
}

export const shadowLengthArgs = (
  defaults?: Partial<ShadowLengthArgs>
): ShadowLengthArgs => ({
  shadowLength: true,
  displayShadowLength: false,
  ...defaults
})

export const shadowLengthArgTypes = (): ArgTypes<ShadowLengthArgs> => ({
  shadowLength: {
    control: {
      type: 'boolean'
    },
    name: 'enable',
    table: { category: 'shadow length' }
  },
  displayShadowLength: {
    control: {
      type: 'boolean'
    },
    name: 'display',
    table: { category: 'shadow length' }
  }
})
