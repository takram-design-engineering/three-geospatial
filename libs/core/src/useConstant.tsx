import { useRef } from 'react'

export function useConstant<T>(callback: () => T): T {
  const ref = useRef<{ value: T }>()
  if (ref.current == null) {
    ref.current = { value: callback() }
  }
  return ref.current.value
}
