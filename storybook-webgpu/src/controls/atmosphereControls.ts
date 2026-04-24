import type { ArgTypes } from '@storybook/react-vite'

export interface AtmosphereArgs {
  transmittance: boolean
  inscattering: boolean
  showGround: boolean
  raymarchScattering: boolean
  higherOrderScatteringTexture: boolean
}

export const atmosphereArgs = (
  defaults?: Partial<AtmosphereArgs>
): AtmosphereArgs => ({
  transmittance: true,
  inscattering: true,
  showGround: true,
  raymarchScattering: true,
  higherOrderScatteringTexture: true,
  ...defaults
})

export const atmosphereArgTypes = (): ArgTypes<AtmosphereArgs> => ({
  transmittance: {
    control: {
      type: 'boolean'
    },
    table: { category: 'atmosphere' }
  },
  inscattering: {
    control: {
      type: 'boolean'
    },
    table: { category: 'atmosphere' }
  },
  showGround: {
    control: {
      type: 'boolean'
    },
    table: { category: 'atmosphere' }
  },
  raymarchScattering: {
    control: {
      type: 'boolean'
    },
    table: { category: 'atmosphere' }
  },
  higherOrderScatteringTexture: {
    control: {
      type: 'boolean'
    },
    table: { category: 'atmosphere' }
  }
})
