import { useCallback, useRef, useState } from 'react'

import type { ColorTuple } from '../types'

export interface ColorWheelState {
  color: ColorTuple
  offset: number
  onColorChange: (color: ColorTuple) => void
  onOffsetChange: (offset: number) => void
  onReset: () => void
}

export function useColorWheelState<
  N extends Record<K, (color: ColorTuple, offset?: number) => N>,
  K extends keyof N
>(
  node: N,
  setter: K,
  initialColor: ColorTuple = [0, 0, 0],
  initialOffset = 0
): ColorWheelState {
  const [color, setColor] = useState<ColorTuple>(initialColor)
  const [offset, setOffset] = useState(initialOffset)

  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const handleColorChange = useCallback(
    (color: ColorTuple) => {
      node[setter](color, offsetRef.current)
      setColor(color)
    },
    [node, setter]
  )

  const colorRef = useRef(color)
  colorRef.current = color

  const handleOffsetChange = useCallback(
    (offset: number) => {
      node[setter](colorRef.current, offset)
      setOffset(offset)
    },
    [node, setter]
  )

  const initialColorRef = useRef(initialColor)
  const initialOffsetRef = useRef(initialOffset)
  initialColorRef.current = initialColor
  initialOffsetRef.current = initialOffset

  const handleReset = useCallback(() => {
    node[setter](initialColorRef.current, initialOffsetRef.current)
    setColor(initialColorRef.current)
    setOffset(initialOffsetRef.current)
  }, [node, setter])

  return {
    color,
    offset,
    onColorChange: handleColorChange,
    onOffsetChange: handleOffsetChange,
    onReset: handleReset
  }
}
