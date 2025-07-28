interface NeedsUpdate {
  set needsUpdate(value: boolean)
}

export function needsUpdate<T extends NeedsUpdate, K extends keyof T & string>(
  target: T,
  propertyKey: K
): void {
  const privateKey = Symbol(propertyKey)
  Object.defineProperty(target, privateKey, {
    enumerable: false,
    configurable: true,
    writable: true
  })
  Object.defineProperty(target, propertyKey, {
    enumerable: true,
    get(this: T & { [privateKey]: T[K] }): T[K] {
      return this[privateKey]
    },
    set(this: T & { [privateKey]: T[K] }, value: T[K]) {
      if (value !== this[privateKey]) {
        this[privateKey] = value
        this.needsUpdate = true
      }
    }
  })
}
