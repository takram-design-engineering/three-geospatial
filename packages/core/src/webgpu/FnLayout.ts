import type {
  ProxiedTuple,
  ShaderCallNodeInternal,
  ShaderNodeFn
} from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import { StructTypeNode, type NodeBuilder } from 'three/webgpu'

import type { Node, NodeType } from './node'

type FnLayoutType =
  | NodeType
  | (new (...args: any[]) => any)
  | ((...args: any[]) => any)

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

type InferNodeObject<T extends FnLayoutType> = T extends NodeType
  ? Node<T>
  : T extends new (...args: any[]) => any
    ? InstanceType<T>
    : T extends (...args: any[]) => any
      ? ReturnType<T>
      : never

type InferNodeObjects<Inputs extends readonly FnLayoutInput[]> = {
  [K in keyof Inputs]: Inputs[K] extends FnLayoutInput<infer T>
    ? InferNodeObject<T>
    : never
}

export type FnLayoutResult<
  T extends FnLayoutType,
  Inputs extends readonly FnLayoutInput[],
  Nodes extends readonly unknown[] = InferNodeObjects<Inputs>
> = (
  callback: (
    ...args: [] extends Nodes ? [NodeBuilder] : [Nodes, NodeBuilder]
  ) => InferNodeObject<T> | ShaderCallNodeInternal
) => ShaderNodeFn<ProxiedTuple<Nodes>>

function transformType(type: FnLayoutType): string {
  if (typeof type === 'string') {
    return type
  }
  if ('layout' in type && type.layout instanceof StructTypeNode) {
    if (type.layout.name == null) {
      throw new Error('Struct name is required.')
    }
    return type.layout.name
  }
  throw new Error(`Unsupported layout type: ${type}`)
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
        })
}
