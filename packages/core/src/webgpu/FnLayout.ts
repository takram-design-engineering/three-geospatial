import type { FnNode, ProxiedTuple, Struct } from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import type {
  Node,
  NodeBuilder,
  Texture3DNode,
  TextureNode
} from 'three/webgpu'

import type { NodeType } from './node'

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

type InferNode<T extends FnLayoutType> = T extends NodeType
  ? Node<T>
  : T extends Struct
    ? ReturnType<T>
    : T extends 'texture'
      ? TextureNode
      : T extends 'texture3D'
        ? Texture3DNode
        : never

type InferNodes<Inputs extends readonly FnLayoutInput[]> = {
  [K in keyof Inputs]: Inputs[K] extends FnLayoutInput<infer T>
    ? InferNode<T>
    : never
}

export type FnLayoutResult<
  T extends FnLayoutType,
  Inputs extends readonly FnLayoutInput[],
  Nodes extends readonly unknown[] = InferNodes<Inputs>
> = (
  callback: (
    ...args: [] extends Nodes ? [NodeBuilder] : [Nodes, NodeBuilder]
  ) => InferNode<T>
) => FnNode<ProxiedTuple<Nodes>, InferNode<T>>

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
    ? callback => Fn(callback as any)
    : callback =>
        Fn(callback as any).setLayout({
          ...layout,
          type: transformType(layout.type),
          inputs:
            layout.inputs?.map(input => ({
              ...input,
              type: transformType(input.type)
            })) ?? []
        }) as any
}
