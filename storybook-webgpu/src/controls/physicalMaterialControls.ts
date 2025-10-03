import type { ArgTypes } from '@storybook/react-vite'
import {
  MeshPhysicalNodeMaterial,
  type MeshPhysicalNodeMaterialParameters
} from 'three/webgpu'

import { useResource } from '../hooks/useResource'
import {
  useSpringColorControl,
  useSpringControl
} from '../hooks/useSpringControl'

export interface PhysicalMaterialArgs {
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

export const physicalMaterialArgs = (
  defaults?: Partial<PhysicalMaterialArgs>
): PhysicalMaterialArgs => ({
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0.5,
  clearcoat: 0,
  clearcoatRoughness: 0,
  ...defaults
})

export const physicalMaterialArgTypes = (): ArgTypes<PhysicalMaterialArgs> => ({
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
    () => new MeshPhysicalNodeMaterial(initialParams),
    [initialParams]
  )

  useSpringColorControl(
    ({ color }: PhysicalMaterialArgs) => color,
    ([r, g, b]) => {
      material.color.setRGB(r, g, b)
    }
  )

  for (const name of [
    'roughness',
    'metalness',
    'clearcoat',
    'clearcoatRoughness'
  ] as const) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSpringControl(
      ({ [name]: value }: PhysicalMaterialArgs) => value,
      value => {
        material[name] = value
      }
    )
  }

  return material
}
