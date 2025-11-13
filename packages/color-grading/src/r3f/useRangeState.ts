import { useCallback, useRef, useState } from 'react'

export interface RangeState {
  value: number
  onChange: (event: { value: number }) => void
  onReset: () => void
}

export function useRangeState<N, K extends keyof N>(
  node: Record<K, number> | null | undefined,
  setter: K,
  initialValue = 0
): RangeState {
  const [value, setValue] = useState(initialValue)

  const offsetRef = useRef(value)
  offsetRef.current = value

  const handleChange = useCallback(
    ({ value }: { value: number }) => {
      if (node != null) {
        node[setter] = value
      }
      setValue(value)
    },
    [node, setter]
  )

  const initialValueRef = useRef(initialValue)
  initialValueRef.current = initialValue

  const handleReset = useCallback(() => {
    if (node != null) {
      node[setter] = initialValueRef.current
    }
    setValue(initialValueRef.current)
  }, [node, setter])

  return {
    value,
    onChange: handleChange,
    onReset: handleReset
  }
}
