import type { ArgTypes } from '@storybook/react-vite'
import {
  MeshPhysicalNodeMaterial,
  type MeshPhysicalNodeMaterialParameters
} from 'three/webgpu'

import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'

export interface PhysicalMaterialArgTypes {
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

export const physicalMaterialArgs = (
  defaults?: Partial<PhysicalMaterialArgTypes>
): PhysicalMaterialArgTypes => ({
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0.5,
  clearcoat: 0,
  clearcoatRoughness: 0,
  ...defaults
})

export const physicalMaterialArgTypes =
  (): ArgTypes<PhysicalMaterialArgTypes> => ({
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
  })

export function usePhysicalMaterialControls(
  initialParams?: MeshPhysicalNodeMaterialParameters
): MeshPhysicalNodeMaterial {
  const material = useResource(
    () => new MeshPhysicalNodeMaterial(initialParams)
  )

  useTransientControl(
    ({
      color,
      roughness,
      metalness,
      clearcoat,
      clearcoatRoughness
    }: PhysicalMaterialArgTypes) => ({
      color,
      roughness,
      metalness,
      clearcoat,
      clearcoatRoughness
    }),
    ({ color, ...values }) => {
      material.color.setStyle(color)
      for (const [key, value] of Object.entries(values)) {
        if (value != null) {
          material[key as keyof PhysicalMaterialArgTypes] = value as any
        }
      }
    }
  )

  return material
}
