import type { Uniform } from 'three'

// TODO: Make mutable value types (e.g. vectors, matrices) read-only.

// Maps argument of type [T1, K1[], T2, K2[], ...] to:
// { [K in K1]: T1[K],
//   [K in K2]: T2[K], ... }
export type PropertyShorthand<Args extends readonly unknown[]> =
  Args extends readonly [infer T, infer K, ...infer Rest]
    ? K extends readonly string[]
      ? K[number] extends keyof T
        ? Rest extends readonly unknown[]
          ? { [P in K[number]]: T[P] } & PropertyShorthand<Rest>
          : { [P in K[number]]: T[P] }
        : never // K must be keyof T
      : never // K must be an array
    : {} // Termination

export function definePropertyShorthand<T, Args extends readonly unknown[]>(
  destination: T,
  ...sourceKeysArgs: [...Args]
): T & PropertyShorthand<Args> {
  const descriptors: PropertyDescriptorMap = {}
  for (let i = 0; i < sourceKeysArgs.length; i += 2) {
    const source = sourceKeysArgs[i]
    const keys = sourceKeysArgs[i + 1] as ReadonlyArray<keyof typeof source>
    for (const key of keys) {
      descriptors[key] = {
        enumerable: true,
        get: () => source[key],
        set: (value: any) => {
          source[key] = value
        }
      }
    }
  }
  Object.defineProperties(destination, descriptors)
  return destination as T & PropertyShorthand<Args>
}

// The argument of defineUniformShorthand can also be variadic, but I can't
// think of any practical use cases for it.

export type UniformShorthand<
  T extends { uniforms: Record<K, Uniform> },
  K extends keyof T['uniforms']
> = {
  [P in K]: T['uniforms'][P] extends Uniform<infer U> ? U : never
}

export function defineUniformShorthand<
  T,
  S extends { uniforms: Record<K, Uniform> },
  K extends keyof S['uniforms']
>(destination: T, source: S, keys: readonly K[]): T & UniformShorthand<S, K> {
  const descriptors: PropertyDescriptorMap = {}
  for (const key of keys) {
    descriptors[key] = {
      enumerable: true,
      get: () => source.uniforms[key].value,
      set: (value: S['uniforms'][K]) => {
        source.uniforms[key].value = value
      }
    }
  }
  Object.defineProperties(destination, descriptors)
  return destination as T & UniformShorthand<S, K>
}
