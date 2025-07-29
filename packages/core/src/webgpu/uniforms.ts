import { reference, uniform, type ShaderNodeObject } from 'three/tsl'
import type { NodeFrame, ReferenceNode, UniformNode } from 'three/webgpu'
import invariant from 'tiny-invariant'

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

export function uniformUpdate<T>(
  value: T,
  callback: (self: ShaderNodeObject<UniformNode<T>>) => T | undefined
): ShaderNodeObject<UniformNode<T>> {
  return uniform(value).onRenderUpdate((_, self) => {
    const value = callback(self)
    if (value != null) {
      self.value = value
    }
  })
}

const uniformTypesKey = Symbol('uniformTypes')

// TODO: Use Stage 3 decorator, but it will break every other decorator.
export function uniformType(type: string) {
  return <T extends {}, K extends keyof T & string>(
    target: T,
    propertyKey: K
  ): void => {
    const constructor = target.constructor as {
      [uniformTypesKey]?: Record<string, string>
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
    uniformTypes[propertyKey] = type
  }
}

export function referenceWith<T extends {}>(
  target: T
): (propertyName: string) => ShaderNodeObject<ReferenceNode<T>> {
  const uniformTypes = (
    target.constructor as {
      [uniformTypesKey]?: Record<string, string>
    }
  )[uniformTypesKey]

  if (uniformTypes == null) {
    throw new Error(
      `No uniform annotations were found in ${target.constructor.name}`
    )
  }
  return (propertyName: string) => {
    const uniformType = uniformTypes?.[propertyName]
    if (uniformType == null) {
      throw new Error(
        `Uniform type was not found for property "${propertyName}" in ${target.constructor.name}`
      )
    }
    return reference(propertyName, uniformType, target)
  }
}
