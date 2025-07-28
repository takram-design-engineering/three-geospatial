import type { ArgTypes } from '@storybook/react-vite'

export const localDateArgTypes: ArgTypes = {
  dayOfYear: {
    control: {
      type: 'range',
      min: 1,
      max: 365,
      step: 1
    },
    table: { category: 'local date' }
  },
  timeOfDay: {
    control: {
      type: 'range',
      min: 0,
      max: 24,
      step: 0.1
    },
    table: { category: 'local date' }
  }
}
