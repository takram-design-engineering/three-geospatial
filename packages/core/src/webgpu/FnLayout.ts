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

export interface FnLayoutInput<T extends FnLayoutType = FnLayoutType> {
  name: string
  type: T
}

export interface FnLayout<
  T extends FnLayoutType,
  Inputs extends readonly FnLayoutInput[] = []
> {
  typeOnly?: boolean
  name: string
  type: T
  inputs?: Inputs
}

type InferNodeType<T extends FnLayoutType> = T extends NodeType
  ? NodeObject<T>
  : T extends Struct
    ? ReturnType<T>
    : T extends 'texture'
      ? NodeObject<TextureNode>
      : T extends 'texture3D'
        ? NodeObject<Texture3DNode>
        : never

type InferCallbackArgs<Inputs extends readonly FnLayoutInput[]> = {
  [K in keyof Inputs]: Inputs[K] extends FnLayoutInput<infer U>
    ? InferNodeType<U>
    : never
}

export type FnLayoutResult<
  T extends FnLayoutType,
  Inputs extends readonly FnLayoutInput[],
  Args extends readonly unknown[] = InferCallbackArgs<Inputs>
> = (
  callback: (
    ...args: [...Args, NodeBuilder]
  ) => InferNodeType<T> | NodeObject<ShaderCallNodeInternal>
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
  const Inputs extends readonly FnLayoutInput[] = []
>({
  typeOnly = false,
  ...layout
}: FnLayout<T, Inputs>): FnLayoutResult<T, Inputs> {
  return typeOnly
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
