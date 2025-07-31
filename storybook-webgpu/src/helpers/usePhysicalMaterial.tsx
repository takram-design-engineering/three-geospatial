import { MeshPhysicalNodeMaterial } from 'three/webgpu'

import type { PhysicalMaterialArgTypes } from '../controls/physicalMaterial'
import { useResource } from './useResource'
import { useTransientControl } from './useTransientControl'

export function usePhysicalMaterial(): MeshPhysicalNodeMaterial {
  const material = useResource(
    () =>
      new MeshPhysicalNodeMaterial({
        color: 'white'
      })
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
      Object.assign(material, values)
    }
  )

  return material
}
