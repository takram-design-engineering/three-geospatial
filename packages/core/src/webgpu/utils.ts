import { reference } from 'three/tsl'
import type { ReferenceNode } from 'three/webgpu'

import { assertType } from '../assertions'
import { NODE_TYPES } from './internals'
import type { NodeType, ShaderNode } from './types'

export function referenceTo<T extends {}>(
  target: T
): (
  propertyName: keyof {
    [K in keyof T as K extends string ? K : never]: unknown
  }
) => ShaderNode<ReferenceNode<T>> {
  const nodeTypes = (
    target.constructor as {
      [NODE_TYPES]?: Record<string, NodeType>
    }
  )[NODE_TYPES]

  if (nodeTypes == null) {
    throw new Error(
      `No uniform annotations were found in ${target.constructor.name}`
    )
  }
  return propertyName => {
    assertType<string>(propertyName)
    const nodeType = nodeTypes?.[propertyName]
    if (nodeType == null) {
      throw new Error(
        `Uniform type was not found for property "${propertyName}" in ${target.constructor.name}`
      )
    }
    return reference(propertyName, nodeType, target)
  }
}
