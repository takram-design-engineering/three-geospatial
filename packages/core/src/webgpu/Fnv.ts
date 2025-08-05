import type { ProxiedTuple, ShaderNodeFn } from 'three/src/nodes/TSL.js'
import { Fn } from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'

const cache = new WeakMap()

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class ObjectValue {}

function createProxy<T extends Record<string | symbol, any>>(value: T): T {
  return new Proxy(value, {
    get: (_, property) => value[property],
    getPrototypeOf: () => ObjectValue.prototype
  })
}

// WORKAROUND: As of r178, "Fn" always expects the callback function to be an
// object form if the type of the first argument is a plain object. This is not
// a limitation of "Fnv" but "Fn" itself.
// For example,
//   Fn(([a, b]) => {})({ a: 1 }, 1)
// doesn't work because "Fn" passes { a: 1 } instead of [{ a: 1 }, 1] to [a, b]
// and causes a runtime error because { a: 1 } is not iterable.
// This behavior can be bypassed when the prototype of the object in the first
// argument is not Object.prototype.
function workaround<T extends readonly unknown[]>(args: T): any {
  const [value, ...rest] = args
  if (value != null && Object.getPrototypeOf(value) === Object.prototype) {
    let proxy = cache.get(value)
    if (proxy == null) {
      proxy = createProxy(value)
      cache.set(value, proxy)
    }
    return [proxy, ...rest]
  }
  return args
}

type NonCallable<T> = T extends (...args: any[]) => any ? never : T

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
