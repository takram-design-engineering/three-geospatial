import { reference } from 'three/tsl'
import type { NodeFrame, ReferenceNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { assertType } from '../assertions'
import type { NodeType, ShaderNode } from './types'

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

const uniformTypesKey = Symbol('uniformTypes')

// TODO: Use Stage 3 decorator, but it will break every other decorator.
export function uniformType(type: NodeType) {
  return <
    T extends {},
    K extends keyof {
      [K in keyof T as K extends string ? K : never]: unknown
    }
  >(
    target: T,
    propertyKey: K
  ): void => {
    const constructor = target.constructor as {
      [uniformTypesKey]?: Record<string, NodeType>
    }
    if (!Object.hasOwn(constructor, uniformTypesKey)) {
      Object.defineProperty(constructor, uniformTypesKey, {
        value: {},
        enumerable: false,
        configurable: true,
        writable: true
      })
    }
    const uniformTypes = constructor[uniformTypesKey]
    invariant(uniformTypes != null)
    uniformTypes[propertyKey as string] = type
  }
}

export function referenceTo<T extends {}>(
  target: T
): (
  propertyName: keyof {
    [K in keyof T as K extends string ? K : never]: unknown
  }
) => ShaderNode<ReferenceNode<T>> {
  const uniformTypes = (
    target.constructor as {
      [uniformTypesKey]?: Record<string, NodeType>
    }
  )[uniformTypesKey]

  if (uniformTypes == null) {
    throw new Error(
      `No uniform annotations were found in ${target.constructor.name}`
    )
  }
  return propertyName => {
    assertType<string>(propertyName)
    const uniformType = uniformTypes?.[propertyName]
    if (uniformType == null) {
      throw new Error(
        `Uniform type was not found for property "${propertyName}" in ${target.constructor.name}`
      )
    }
    return reference(propertyName, uniformType, target)
  }
}
