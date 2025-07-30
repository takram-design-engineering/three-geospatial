import { reference } from 'three/tsl'
import type { ReferenceNode, VarNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { NODE_TYPES } from './internals'
import {
  node,
  type NodeObject,
  type NodeType,
  type NodeValueType
} from './node'

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

export function referenceTo<T extends {}>(target: T) {
  const nodeTypes = getNodeTypes(target)
  return <K extends NodeValuePropertyKey<T>>(
    propertyName: K
  ): NodeObject<ReferenceNode<T>> => {
    const nodeType = nodeTypes[propertyName]
    if (nodeType == null) {
      throw new Error(
        `Node type annotation was not found for property "${String(propertyName)}" in ${target.constructor.name}`
      )
    }
    return reference(propertyName as string, nodeType, target)
  }
}

export function propertyOf<T extends {}>(target: T) {
  const nodeTypes = getNodeTypes(target)
  return <K extends NodeValuePropertyKey<T>>(
    propertyName: K,
    transformValue?: (value: T[K]) => T[K],
    transformNode?: (node: NodeObject) => NodeObject
  ): NodeObject<VarNode> => {
    const nodeType = nodeTypes[propertyName]
    if (nodeType == null) {
      throw new Error(
        `Node type annotation was not found for property "${String(propertyName)}" in ${target.constructor.name}`
      )
    }
    let propertyValue = target[propertyName]
    if (transformValue != null) {
      if (typeof propertyValue === 'object' && propertyValue != null) {
        invariant('clone' in propertyValue)
        invariant(typeof propertyValue.clone === 'function')
        propertyValue = propertyValue.clone()
      }
      propertyValue = transformValue(propertyValue)
    }
    let propertyNode = node(nodeType)(propertyValue as any)
    if (transformNode != null) {
      propertyNode = transformNode(propertyNode)
    }
    return propertyNode.toVar()
  }
}
