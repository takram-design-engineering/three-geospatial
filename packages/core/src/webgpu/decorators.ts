import { reference } from 'three/tsl'
import type { Node } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { assertType } from '../assertions'
import { NODE_TYPES } from './internals'
import type { NodeType, NodeValueType } from './node'

// TODO: Use the stage 2 decorator with metadata support, but it will break
// every other decorator.
export function nodeType(type: NodeType) {
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
      [NODE_TYPES]?: Record<string, NodeType>
    }
    if (!Object.hasOwn(constructor, NODE_TYPES)) {
      Object.defineProperty(constructor, NODE_TYPES, {
        value: {},
        enumerable: false,
        configurable: true,
        writable: true
      })
    }
    const nodeTypes = constructor[NODE_TYPES]
    invariant(nodeTypes != null)
    nodeTypes[propertyKey as string] = type
  }
}

type InferPropertyKey<T> = T extends `${infer PropertyKey}Node`
  ? PropertyKey['length'] extends 0
    ? never
    : PropertyKey
  : never

export function referenceNode(type: NodeType) {
  return <
    T extends Record<K, Node> & Record<InferPropertyKey<K>, NodeValueType>,
    K extends keyof {
      [K in keyof T as K extends string ? K : never]: unknown
    }
  >(
    target: T,
    propertyKey: K
  ): void => {
    assertType<string>(propertyKey)
    invariant(propertyKey.length > 4)
    invariant(propertyKey.endsWith('Node'))

    let propertyValue
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get() {
        return (propertyValue ??= reference(
          propertyKey.slice(0, -4),
          type,
          this
        ))
      },
      set(value) {
        propertyValue = value
      }
    })
  }
}

interface NeedsUpdate {
  set needsUpdate(value: boolean)
}

export function needsUpdate() {
  return <
    T extends NeedsUpdate,
    K extends keyof {
      [K in keyof T as K extends string ? K : never]: unknown
    }
  >(
    target: T,
    propertyKey: K
  ) => {
    const privateKey = Symbol(propertyKey as string)
    Object.defineProperty(target, privateKey, {
      enumerable: false,
      configurable: true,
      writable: true
    })
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get(this: T & { [privateKey]: T[K] }): T[K] {
        return this[privateKey]
      },
      set(this: T & { [privateKey]: T[K] }, value: T[K]) {
        if (value !== this[privateKey]) {
          this[privateKey] = value
          this.needsUpdate = true
        }
      }
    })
  }
}
