import type { FloatType, HalfFloatType, Uniform } from 'three'
import type { Writable } from 'type-fest'

export type Callable = (...args: any) => any

export type UniformMap<T> = Omit<Map<string, Uniform>, 'get'> & {
  get: <K extends keyof T>(key: K) => T[K]
  set: <K extends keyof T>(key: K, value: T[K]) => void
}

export type AnyFloatType = typeof FloatType | typeof HalfFloatType

export type WritableProperties<T, U = Writable<T>> = {
  [K in keyof U as U[K] extends Callable ? never : K]: U[K]
}
