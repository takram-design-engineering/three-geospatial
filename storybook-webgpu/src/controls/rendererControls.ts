import type { ArgTypes } from '@storybook/react-vite'

export interface RendererArgs {
  showStats: boolean
  forceWebGL: boolean
}

export const rendererArgs = (
  defaults?: Partial<RendererArgs>
): RendererArgs => ({
  showStats: false,
  forceWebGL: false,
  ...defaults
})

export const rendererArgTypes = (): ArgTypes<RendererArgs> => ({
  showStats: {
    control: {
      type: 'boolean'
    },
    table: { category: 'renderer' }
  },
  forceWebGL: {
    name: 'force webgl',
    control: {
      type: 'boolean'
    },
    table: { category: 'renderer' }
  }
})
