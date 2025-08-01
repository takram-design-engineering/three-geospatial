import type { ArgTypes } from '@storybook/react-vite'
import type { Camera } from 'three'
import { directionToColor } from 'three/tsl'
import type { PassNode } from 'three/webgpu'

import { depthToColor, type Node } from '@takram/three-geospatial/webgpu'

import { useTransientControl } from '../helpers/useTransientControl'

export interface OutputPassArgs {
  depth: boolean
  normal: boolean
}

export const outputPassArgs = (
  defaults?: Partial<OutputPassArgs>
): OutputPassArgs => ({
  depth: false,
  normal: false,
  ...defaults
})

export const outputPassArgTypes = (): ArgTypes<OutputPassArgs> => ({
  depth: {
    control: {
      type: 'boolean'
    },
    table: { category: 'output pass' }
  },
  normal: {
    control: {
      type: 'boolean'
    },
    table: { category: 'output pass' }
  }
})

export function useOutputPassControl(
  passNode: PassNode,
  camera: Camera,
  onChange: (outputNode?: Node) => void
): void {
  useTransientControl(
    ({ depth, normal }: OutputPassArgs) => ({ depth, normal }),
    ({ depth, normal }) => {
      onChange(
        // In reverse order:
        normal
          ? directionToColor(passNode.getTextureNode('normal'))
          : depth
            ? depthToColor(passNode.getTextureNode('depth'), camera)
            : undefined
      )
    }
  )
}
