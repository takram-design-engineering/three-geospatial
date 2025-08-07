import type { ArgTypes } from '@storybook/react-vite'
import type { Camera } from 'three'
import { directionToColor } from 'three/tsl'
import type { PassNode } from 'three/webgpu'

import { depthToColor, type Node } from '@takram/three-geospatial/webgpu'

import { useTransientControl } from '../helpers/useTransientControl'

export interface OutputPassArgs {
  outputDepth: boolean
  outputNormal: boolean
}

export const outputPassArgs = (
  defaults?: Partial<OutputPassArgs>
): OutputPassArgs => ({
  outputDepth: false,
  outputNormal: false,
  ...defaults
})

export const outputPassArgTypes = (
  options: {
    hasDepth?: boolean
    hasNormal?: boolean
  } = {}
): ArgTypes<OutputPassArgs> => ({
  outputDepth: {
    name: 'depth',
    control: {
      type: 'boolean',
      disable: options.hasDepth === false
    },
    table: { category: 'output pass' }
  },
  outputNormal: {
    name: 'normal',
    control: {
      type: 'boolean',
      disable: options.hasNormal === false
    },
    table: { category: 'output pass' }
  }
})

export function useOutputPassControls(
  passNode: PassNode,
  camera: Camera,
  onChange: (outputNode?: Node) => void
): void {
  useTransientControl(
    ({ outputDepth, outputNormal }: OutputPassArgs) => ({
      outputDepth,
      outputNormal
    }),
    ({ outputDepth, outputNormal }) => {
      let pass: Node | undefined = undefined
      // In reverse order:
      if (outputNormal) {
        pass = directionToColor(passNode.getTextureNode('normal'))
      } else if (outputDepth) {
        pass = depthToColor(passNode.getTextureNode('depth'), camera)
      }
      onChange(pass)
    }
  )
}
