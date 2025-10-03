import type { MotionValue } from 'motion/react'
import { useEffect, useRef } from 'react'

type InferValues<T extends MotionValue[]> = T extends [
  MotionValue<infer U>,
  ...infer Rest extends MotionValue[]
]
  ? [U, ...InferValues<Rest>]
  : []

export function useCombinedChange<const T extends MotionValue[]>(
  values: T,
  onChange: (values: InferValues<T>) => void
): void {
  const ref = useRef(values.map(value => value.get()) as InferValues<T>)
  onChange(ref.current) // Initial callback

  useEffect(() => {
    const offs = values.map((value, i) =>
      value.on('change', value => {
        ref.current[i] = value
        onChange(ref.current)
      })
    )
    return () => {
      offs.forEach(off => {
        off()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...values, onChange])
}
