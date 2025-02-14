import { type Material } from 'three'

import { clamp } from '../math'

export function define(name: string) {
  return <T extends Material, K extends keyof T>(
    target: T[K] extends boolean ? T : never,
    propertyKey: K
  ) => {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get(this: T): boolean {
        return this.defines?.[name] != null
      },
      set(this: T, value: boolean) {
        if (value !== this[propertyKey]) {
          if (value) {
            this.defines ??= {}
            this.defines[name] = '1'
          } else {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.defines?.[name]
          }
          this.needsUpdate = true
        }
      }
    })
  }
}

export interface DefineIntOptions {
  min?: number
  max?: number
}

export function defineInt(
  name: string,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  }: DefineIntOptions = {}
) {
  return <T extends Material, K extends keyof T>(
    target: T[K] extends number ? T : never,
    propertyKey: K
  ) => {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get(this: T): number {
        const value = this.defines?.[name]
        return value != null ? parseInt(value) : 0
      },
      set(this: T, value: number) {
        const prevValue = this[propertyKey]
        if (value !== prevValue) {
          this.defines ??= {}
          this.defines[name] = clamp(value, min, max).toFixed(0)
          this.needsUpdate = true
        }
      }
    })
  }
}

export interface DefineFloatOptions {
  min?: number
  max?: number
  precision?: number
}

export function defineFloat(
  name: string,
  { min = -Infinity, max = Infinity, precision = 7 }: DefineFloatOptions = {}
) {
  return <T extends Material, K extends keyof T>(
    target: T[K] extends number ? T : never,
    propertyKey: K
  ) => {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get(this: T): number {
        const value = this.defines?.[name]
        return value != null ? parseFloat(value) : 0
      },
      set(this: T, value: number) {
        const prevValue = this[propertyKey]
        if (value !== prevValue) {
          this.defines ??= {}
          this.defines[name] = clamp(value, min, max).toFixed(precision)
          this.needsUpdate = true
        }
      }
    })
  }
}
