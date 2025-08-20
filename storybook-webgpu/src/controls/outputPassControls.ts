import type { ArgTypes } from '@storybook/react-vite'
import { useRef } from 'react'
import { directionToColor } from 'three/tsl'
import type { PassNode, PostProcessing } from 'three/webgpu'

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
  postProcessing: PostProcessing,
  passNode: PassNode,
  onChange: (outputNode: Node, outputColorTransform: boolean) => void
): void {
  const ref = useRef({
    outputNode: postProcessing.outputNode,
    outputColorTransform: postProcessing.outputColorTransform
  })

  useTransientControl(
    ({ outputDepth, outputNormal }: OutputPassArgs) => ({
      outputDepth,
      outputNormal
    }),
    ({ outputDepth, outputNormal }) => {
      let outputNode = ref.current.outputNode
      let outputColorTransform = ref.current.outputColorTransform
      // In reverse order:
      if (outputNormal) {
        outputNode = directionToColor(passNode.getTextureNode('normal'))
        outputColorTransform = false
      } else if (outputDepth) {
        outputNode = depthToColor(
          passNode.getTextureNode('depth'),
          passNode.camera
        )
        outputColorTransform = false
      }
      onChange(outputNode, outputColorTransform)
    }
  )
}
