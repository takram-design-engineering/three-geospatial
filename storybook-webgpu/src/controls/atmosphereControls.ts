import type { ArgTypes } from '@storybook/react-vite'

export interface AtmosphereArgs {
  transmittance: boolean
  inscattering: boolean
  showGround: boolean
  raymarchScattering: boolean
}

export const atmosphereArgs = (
  defaults?: Partial<AtmosphereArgs>
): AtmosphereArgs => ({
  transmittance: true,
  inscattering: true,
  showGround: true,
  raymarchScattering: false,
  ...defaults
})

export const atmosphereArgTypes = (): ArgTypes<AtmosphereArgs> => ({
  transmittance: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  inscattering: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  showGround: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  raymarchScattering: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  }
})
