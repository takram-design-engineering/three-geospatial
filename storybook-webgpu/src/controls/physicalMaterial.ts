import type { ArgTypes } from '@storybook/react-vite'

export interface PhysicalMaterialArgTypes {
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

export const physicalMaterialArgTypes: ArgTypes<PhysicalMaterialArgTypes> = {
  color: {
    control: {
      type: 'color'
    },
    table: { category: 'physical material' }
  },
  roughness: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    },
    table: { category: 'physical material' }
  },
  metalness: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    },
    table: { category: 'physical material' }
  },
  clearcoat: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    },
    table: { category: 'physical material' }
  },
  clearcoatRoughness: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    },
    table: { category: 'physical material' }
  }
}
