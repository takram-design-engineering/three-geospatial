import type { ArgTypes } from '@storybook/react-vite'

export interface RendererArgs {
  showStats: boolean
  forceWebGL: boolean
  pixelRatio: number
}

export const rendererArgs = (
  defaults?: Partial<RendererArgs>
): RendererArgs => ({
  showStats: false,
  forceWebGL: false,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
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
  },
  pixelRatio: {
    name: 'pixel ratio',
    control: {
      type: 'range',
      min: 0.5,
      max: 3.5,
      step: 0.1
    },
    table: { category: 'renderer' }
  }
})
