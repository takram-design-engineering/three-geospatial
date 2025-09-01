import type { ArgTypes } from '@storybook/react-vite'
import { useRef } from 'react'
import { directionToColor, vec4 } from 'three/tsl'
import type { PassNode, PostProcessing } from 'three/webgpu'

import { depthToColor, type Node } from '@takram/three-geospatial/webgpu'

import { useTransientControl } from '../helpers/useTransientControl'

export interface OutputPassArgs {
  outputDepth: boolean
  outputNormal: boolean
  outputVelocity: boolean
}

export const outputPassArgs = (
  defaults?: Partial<OutputPassArgs>
): OutputPassArgs => ({
  outputDepth: false,
  outputNormal: false,
  outputVelocity: false,
  ...defaults
})

export const outputPassArgTypes = (
  options: {
    hasDepth?: boolean
    hasNormal?: boolean
    hasVelocity?: boolean
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
  },
  outputVelocity: {
    name: 'velocity',
    control: {
      type: 'boolean',
      disable: options.hasVelocity === false
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
    ({ outputDepth, outputNormal, outputVelocity }: OutputPassArgs) => ({
      outputDepth,
      outputNormal,
      outputVelocity
    }),
    ({ outputDepth, outputNormal, outputVelocity }) => {
      let outputNode = ref.current.outputNode
      let outputColorTransform = ref.current.outputColorTransform
      // In reverse order:
      if (outputNormal) {
        const normalNode = passNode.getTextureNode('normal')
        outputNode = directionToColor(normalNode)
        outputColorTransform = false
      } else if (outputDepth) {
        const depthNode = passNode.getTextureNode('depth')
        outputNode = depthToColor(depthNode, passNode.camera)
        outputColorTransform = false
      } else if (outputVelocity) {
        const velocityNode = passNode.getTextureNode('velocity')
        outputNode = vec4(velocityNode.xyz.mul(10).add(0.5), 1)
        outputColorTransform = true
      }
      onChange(outputNode, outputColorTransform)
    }
  )
}
