import {
  MeshPhysicalNodeMaterial,
  type MeshPhysicalNodeMaterialParameters
} from 'three/webgpu'

import type { PhysicalMaterialArgTypes } from '../controls/physicalMaterial'
import { useResource } from './useResource'
import { useTransientControl } from './useTransientControl'

export function usePhysicalMaterial(
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
