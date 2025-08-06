import { uniform } from 'three/tsl'
import type { UniformGroupNode, UniformNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { NODE_TYPES } from './internals'
import type { NodeObject, NodeType, NodeValueType } from './node'

type NodeValuePropertyKey<T> = keyof {
  [K in keyof T as K extends string
    ? T[K] extends NodeValueType
      ? K
      : never
    : never]: unknown
}

function getNodeTypes<T extends {}>(target: T): Record<keyof T, NodeType> {
  const nodeTypes = (
    target.constructor as {
      [NODE_TYPES]?: Record<keyof T, NodeType>
    }
  )[NODE_TYPES]

  if (nodeTypes == null) {
    throw new Error(
      `No node type annotations were found in ${target.constructor.name}`
    )
  }
  return nodeTypes
}

export interface ReferenceOptions {
  group?: UniformGroupNode
  withName?: boolean
}

export interface ReferenceFunction<T extends {}> {
  <K extends NodeValuePropertyKey<T>>(
    propertyName: K
  ): NodeObject<UniformNode<unknown>>

  <K extends NodeValuePropertyKey<T>>(
    propertyName: K,
    transformValue: (value: T[K]) => T[K]
  ): NodeObject<UniformNode<T[K]>>
}

export function referenceTo<T extends {}>(
  target: T,
  { group, withName = false }: ReferenceOptions = {}
): ReferenceFunction<T> {
  const nodeTypes = getNodeTypes(target)
  return <K extends NodeValuePropertyKey<T>>(
    propertyName: K,
    transformValue?: (value: T[K]) => T[K]
  ): NodeObject<UniformNode<unknown>> => {
    const nodeType = nodeTypes[propertyName]
    if (nodeType == null) {
      throw new Error(
        `Node type annotation was not found for property "${String(propertyName)}" in ${target.constructor.name}`
      )
    }

    let result
    const propertyValue = target[propertyName]
    if (transformValue != null) {
      if (typeof propertyValue === 'object' && propertyValue != null) {
        invariant('clone' in propertyValue)
        invariant(typeof propertyValue.clone === 'function')
        invariant('copy' in propertyValue)
        invariant(typeof propertyValue.copy === 'function')
        // Transformation on an object (with clone and copy methods):
        result = uniform(propertyValue.clone(), nodeType).onRenderUpdate(
          (_, { value }) => {
            value = transformValue(value.copy(target[propertyName]))
          }
        )
      } else {
        // Transformation on a primitive:
        result = uniform(propertyValue, nodeType).onRenderUpdate((_, self) => {
          self.value = transformValue(target[propertyName])
        })
      }
    } else {
      // No transformation:
      result = uniform(nodeType).onRenderUpdate(() => target[propertyName])
    }

    if (group != null) {
      result = result.setGroup(group)
    }
    if (withName) {
      result = result.setName(propertyName as string)
    }
    return result
  }
}
