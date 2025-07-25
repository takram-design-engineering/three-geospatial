import type { ProxiedTuple, ShaderNodeFn } from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'

type NonCallable<T> = T extends (...args: any[]) => any ? never : T

// TODO: Fn recognizes the first parameter as an object form if JS object is
// provided.

export function Fnv<Args extends readonly unknown[], R>(
  fn: (...args: Args) => (builder: NodeBuilder) => NonCallable<R>
): ShaderNodeFn<ProxiedTuple<Args>>

export function Fnv<Args extends readonly unknown[], R>(
  fn: (...args: Args) => NonCallable<R>
): ShaderNodeFn<ProxiedTuple<Args>>

export function Fnv<Args extends readonly unknown[], R>(
  fn: ((...args: Args) => R) | ((...args: Args) => (builder: NodeBuilder) => R)
): ShaderNodeFn<ProxiedTuple<Args>> {
  return Fn((args: Args, builder: NodeBuilder) => {
    const result = fn(...args)
    return typeof result === 'function'
      ? (result as (builder: NodeBuilder) => R)(builder)
      : result
  })
}
