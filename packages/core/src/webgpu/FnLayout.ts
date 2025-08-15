import type {
  ProxiedTuple,
  ShaderCallNodeInternal,
  ShaderNodeFn,
  Struct
} from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import type { NodeBuilder, Texture3DNode, TextureNode } from 'three/webgpu'

import type { NodeObject, NodeType } from './node'

// Note that "texture" and "texture3D" are just placeholders until TSL supports
// texture types.
type FnLayoutType = NodeType | Struct | 'texture' | 'texture3D'

export interface FnInputLayout<T extends FnLayoutType = FnLayoutType> {
  name: string
  type: T
}

export interface FnLayout<
  T extends FnLayoutType,
  Inputs extends readonly FnInputLayout[] = []
> {
  typeOnly?: boolean
  name: string
  type: T
  inputs?: Inputs
}

type InferLayoutType<T extends FnLayoutType> = T extends NodeType
  ? NodeObject<T>
  : T extends Struct
    ? ReturnType<T>
    : T extends 'texture'
      ? NodeObject<TextureNode>
      : T extends 'texture3D'
        ? NodeObject<Texture3DNode>
        : never

type InferCallbackArgs<Inputs extends readonly FnInputLayout[]> = {
  [K in keyof Inputs]: Inputs[K] extends FnInputLayout<infer U>
    ? InferLayoutType<U>
    : never
}

type FnLayoutResult<
  T extends FnLayoutType,
  Inputs extends readonly FnInputLayout[],
  Args extends readonly unknown[] = InferCallbackArgs<Inputs>
> = (
  callback: (
    ...args: [...Args, NodeBuilder]
  ) => InferLayoutType<T> | NodeObject<ShaderCallNodeInternal>
) => ShaderNodeFn<ProxiedTuple<Args>>

function transformType(type: FnLayoutType): string {
  if (typeof type === 'string') {
    return type
  }
  if (type.layout.name == null) {
    throw new Error('Struct name is required.')
  }
  return type.layout.name
}

export function FnLayout<
  T extends FnLayoutType,
  const Inputs extends readonly FnInputLayout[] = []
>(layout: FnLayout<T, Inputs>): FnLayoutResult<T, Inputs> {
  return layout.typeOnly === true
    ? callback =>
        Fn((args: unknown[], builder: NodeBuilder) =>
          // @ts-expect-error Ignore
          callback(...args, builder)
        )
    : callback =>
        Fn((args: unknown[], builder: NodeBuilder) =>
          // @ts-expect-error Ignore
          callback(...args, builder)
        ).setLayout({
          ...layout,
          type: transformType(layout.type),
          inputs:
            layout.inputs?.map(input => ({
              ...input,
              type: transformType(input.type)
            })) ?? []
        })
}

// Example:
// const s = struct({ a: 'vec3', b: 'float' })
// const f = FnLayout({
//   name: 'f',
//   type: s,
//   inputs: [
//     { name: 'a', type: 'vec3' },
//     { name: 'b', type: 'float' },
//     { name: 'c', type: 'float' }
//   ]
// })(([a, b, c]) => {
//   return s(a.mul(b).add(c), b.mul(c))
// })
