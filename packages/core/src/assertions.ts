export function assertType<T>(value: unknown): asserts value is T {}

export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value != null
}

export function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function isNotFalse<T>(value: T | false): value is T {
  return value !== false
}
