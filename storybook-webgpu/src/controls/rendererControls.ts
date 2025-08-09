import type { ArgTypes } from '@storybook/react-vite'

export interface RendererArgs {
  forceWebGL: boolean
}

export const rendererArgs = (
  defaults?: Partial<RendererArgs>
): RendererArgs => ({
  forceWebGL: false,
  ...defaults
})

export const rendererArgTypes = (): ArgTypes<RendererArgs> => ({
  forceWebGL: {
    name: 'force webgl',
    control: {
      type: 'boolean'
    },
    table: { category: 'renderer' }
  }
})
