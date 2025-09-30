import { MotionValue, motionValue } from 'motion/react'
import { useMemo } from 'react'

export function useMaybeMotionValue<T>(
  value: T | MotionValue<T>
): MotionValue<T> {
  return useMemo(
    () => (value instanceof MotionValue ? value : motionValue(value)),
    [value]
  )
}
