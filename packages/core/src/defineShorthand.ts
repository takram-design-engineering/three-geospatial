import { type Uniform } from 'three'

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
  for (const key of keys) {
    Object.defineProperty(destination, key, {
      get: () => source.uniforms[key].value,
      set: (value: S['uniforms'][K]) => {
        source.uniforms[key].value = value
      }
    })
  }
  return destination as T & UniformShorthand<S, K>
}

export type PropertyShorthand<T, K extends keyof T> = { [P in K]: T[P] }

export function definePropertyShorthand<T, S, K extends keyof S>(
  destination: T,
  source: S,
  keys: readonly K[]
): T & PropertyShorthand<S, K> {
  for (const key of keys) {
    Object.defineProperty(destination, key, {
      get: () => source[key],
      set: (value: S[K]) => {
        source[key] = value
      }
    })
  }
  return destination as T & PropertyShorthand<S, K>
}
