import type { FnNode, ProxiedTuple } from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'

type NonCallable<T> = T extends (...args: any[]) => any ? never : T

export function FnVar<Args extends readonly unknown[], R>(
  callback: (...args: Args) => (builder: NodeBuilder) => R
): FnNode<ProxiedTuple<Args>, R>

export function FnVar<Args extends readonly unknown[], R>(
  callback: (...args: Args) => NonCallable<R>
): FnNode<ProxiedTuple<Args>, R>

export function FnVar<Args extends readonly unknown[], R>(
  callback:
    | ((...args: Args) => R)
    | ((...args: Args) => (builder: NodeBuilder) => R)
): FnNode<ProxiedTuple<Args>, R> {
  return Fn((args: Args, builder: NodeBuilder) => {
    const result = callback(...args)
    return typeof result === 'function'
      ? (result as (builder: NodeBuilder) => R)(builder)
      : result
  })
}
