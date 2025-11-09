import { useCallback, useRef, useState } from 'react'

export interface RangeState {
  value: number
  onChange: (value: number) => void
  onReset: () => void
}

export function useRangeState<N, K extends keyof N>(
  node: Record<K, number>,
  setter: K,
  initialValue = 0
): RangeState {
  const [value, setValue] = useState(initialValue)

  const offsetRef = useRef(value)
  offsetRef.current = value

  const handleChange = useCallback(
    (value: number) => {
      node[setter] = value
      setValue(value)
    },
    [node, setter]
  )

  const initialValueRef = useRef(initialValue)
  initialValueRef.current = initialValue

  const handleReset = useCallback(() => {
    node[setter] = initialValueRef.current
    setValue(initialValueRef.current)
  }, [node, setter])

  return {
    value,
    onChange: handleChange,
    onReset: handleReset
  }
}
