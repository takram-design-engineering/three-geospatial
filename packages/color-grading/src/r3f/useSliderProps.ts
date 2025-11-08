import { useCallback, useRef, useState, type ChangeEvent } from 'react'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useSliderProps<N, K extends keyof N>(
  node: Record<K, number>,
  setter: K,
  initialValue = 0
) {
  const [value, setValue] = useState(initialValue)

  const offsetRef = useRef(value)
  offsetRef.current = value

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = +event.target.value
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
