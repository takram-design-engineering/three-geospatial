import { type Uniform } from 'three'

export type Callable = (...args: any) => any

export type UniformMap<T> = Omit<Map<string, Uniform>, 'get'> & {
  get: <K extends keyof T>(key: K) => T[K]
  set: <K extends keyof T>(key: K, value: T[K]) => void
}
