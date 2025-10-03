import type { ArgTypes } from '@storybook/react-vite'
import { useMemo } from 'react'
import { directionToColor, vec4 } from 'three/tsl'
import type { PassNode, PostProcessing } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToColor,
  type Node
} from '@takram/three-geospatial/webgpu'

import { useTransientControl } from '../hooks/useTransientControl'

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
  const initial = useMemo(
    () => ({
      outputNode: postProcessing.outputNode,
      outputColorTransform: postProcessing.outputColorTransform
    }),
    [postProcessing]
  )

  useTransientControl(
    ({ outputDepth, outputNormal, outputVelocity }: OutputPassArgs) => ({
      outputDepth,
      outputNormal,
      outputVelocity
    }),
    ({ outputDepth, outputNormal, outputVelocity }) => {
      let outputNode = initial.outputNode
      let outputColorTransform = initial.outputColorTransform

      // In reverse order:
      if (outputNormal) {
        const normalNode = passNode.getTextureNode('normal')
        outputNode = directionToColor(normalNode)
        outputColorTransform = false
      } else if (outputDepth) {
        const depthNode = passNode.getTextureNode('depth')
        outputNode = depthToColor(
          depthNode,
          cameraNear(passNode.camera),
          cameraFar(passNode.camera),
          {
            perspective: passNode.camera.isPerspectiveCamera,
            logarithmic: postProcessing.renderer.logarithmicDepthBuffer
          }
        )
        outputColorTransform = false
      } else if (outputVelocity) {
        const velocityNode = passNode.getTextureNode('velocity')
        outputNode = vec4(velocityNode.xyz.mul(20).add(0.5), 1)
        outputColorTransform = true
      }

      onChange(outputNode, outputColorTransform)
    }
  )
}
