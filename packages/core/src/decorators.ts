import { Material } from 'three'

import { clamp } from './math'

interface MaterialLike {
  defines?: Record<string, string>
  set needsUpdate(value: boolean)
}

interface EffectLike {
  defines: Map<string, string>
}

export function define(name: string) {
  return <T extends MaterialLike | EffectLike, K extends keyof T>(
    target: T[K] extends boolean ? T : never,
    propertyKey: K
  ) => {
    if (target instanceof Material) {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, Material>): boolean {
          return this.defines?.[name] != null
        },
        set(this: Extract<T, Material>, value: boolean) {
          if (value !== this[propertyKey]) {
            if (value) {
              this.defines ??= {}
              this.defines[name] = '1'
            } else {
              delete this.defines?.[name]
            }
            this.needsUpdate = true
          }
        }
      })
    } else {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, EffectLike>): boolean {
          return this.defines.has(name)
        },
        set(this: Extract<T, EffectLike>, value: boolean) {
          if (value !== this[propertyKey]) {
            if (value) {
              this.defines.set(name, '1')
            } else {
              this.defines.delete(name)
            }
            ;(this as any).setChanged() // Bypass protected privilege
          }
        }
      })
    }
  }
}

export interface DefineIntDecoratorOptions {
  min?: number
  max?: number
}

export function defineInt(
  name: string,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  }: DefineIntDecoratorOptions = {}
) {
  return <T extends MaterialLike | EffectLike, K extends keyof T>(
    target: T[K] extends number ? T : never,
    propertyKey: K
  ) => {
    if (target instanceof Material) {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, Material>): number {
          const value = this.defines?.[name]
          return value != null ? parseInt(value, 10) : 0
        },
        set(this: Extract<T, Material>, value: number) {
          const prevValue = this[propertyKey]
          if (value !== prevValue) {
            this.defines ??= {}
            this.defines[name] = clamp(value, min, max).toFixed(0)
            this.needsUpdate = true
          }
        }
      })
    } else {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, EffectLike>): number {
          const value = this.defines.get(name)
          return value != null ? parseInt(value, 10) : 0
        },
        set(this: Extract<T, EffectLike>, value: number) {
          const prevValue = this[propertyKey]
          if (value !== prevValue) {
            this.defines.set(name, clamp(value, min, max).toFixed(0))
            ;(this as any).setChanged() // Bypass protected privilege
          }
        }
      })
    }
  }
}

export interface DefineFloatDecoratorOptions {
  min?: number
  max?: number
  precision?: number
}

export function defineFloat(
  name: string,
  {
    min = -Infinity,
    max = Infinity,
    precision = 7
  }: DefineFloatDecoratorOptions = {}
) {
  return <T extends MaterialLike | EffectLike, K extends keyof T>(
    target: T[K] extends number ? T : never,
    propertyKey: K
  ) => {
    if (target instanceof Material) {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, Material>): number {
          const value = this.defines?.[name]
          return value != null ? parseFloat(value) : 0
        },
        set(this: Extract<T, Material>, value: number) {
          const prevValue = this[propertyKey]
          if (value !== prevValue) {
            this.defines ??= {}
            this.defines[name] = clamp(value, min, max).toFixed(precision)
            this.needsUpdate = true
          }
        }
      })
    } else {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, EffectLike>): number {
          const value = this.defines.get(name)
          return value != null ? parseFloat(value) : 0
        },
        set(this: Extract<T, EffectLike>, value: number) {
          const prevValue = this[propertyKey]
          if (value !== prevValue) {
            this.defines.set(name, clamp(value, min, max).toFixed(precision))
            ;(this as any).setChanged() // Bypass protected privilege
          }
        }
      })
    }
  }
}

export interface DefineExpressionDecoratorOptions {
  validate?: (value: string) => boolean
}

export function defineExpression(
  name: string,
  { validate }: DefineExpressionDecoratorOptions = {}
) {
  return <T extends MaterialLike | EffectLike, K extends keyof T>(
    target: T[K] extends string ? T : never,
    propertyKey: K
  ) => {
    if (target instanceof Material) {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, Material>): string {
          return this.defines?.[name] ?? ''
        },
        set(this: Extract<T, Material>, value: string) {
          if (value !== this[propertyKey]) {
            if (validate?.(value) === false) {
              console.error(`Expression validation failed: ${value}`)
              return
            }
            this.defines ??= {}
            this.defines[name] = value
            this.needsUpdate = true
          }
        }
      })
    } else {
      Object.defineProperty(target, propertyKey, {
        enumerable: true,
        get(this: Extract<T, EffectLike>): string {
          return this.defines.get(name) ?? ''
        },
        set(this: Extract<T, EffectLike>, value: string) {
          if (value !== this[propertyKey]) {
            if (validate?.(value) === false) {
              console.error(`Expression validation failed: ${value}`)
              return
            }
            this.defines.set(name, value)
            ;(this as any).setChanged() // Bypass protected privilege
          }
        }
      })
    }
  }
}
