import { useCallback, useRef, useState } from 'react'
import { Vector3 } from 'three'

import type { ColorTuple } from '../types'
import type { ColorWheelProps } from './ColorWheel'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function useWheelProps<
  N extends Record<K, (color: Vector3, offset?: number) => N>,
  K extends keyof N
>(
  node: N,
  setter: K,
  initialColor: ColorTuple = [0, 0, 0],
  initialOffset = 0
): Partial<ColorWheelProps> {
  const [color, setColor] = useState<ColorTuple>(initialColor)
  const [offset, setOffset] = useState(initialOffset)

  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const handleColorChange = useCallback(
    (color: ColorTuple) => {
      node[setter](vectorScratch.set(...color), offsetRef.current)
      setColor(color)
    },
    [node, setter]
  )

  const colorRef = useRef(color)
  colorRef.current = color

  const handleOffsetChange = useCallback(
    (offset: number) => {
      node[setter](vectorScratch.set(...colorRef.current), offset)
      setOffset(offset)
    },
    [node, setter]
  )

  const initialColorRef = useRef(initialColor)
  const initialOffsetRef = useRef(initialOffset)
  initialColorRef.current = initialColor
  initialOffsetRef.current = initialOffset

  const handleReset = useCallback(() => {
    node[setter](
      vectorScratch.set(...initialColorRef.current),
      initialOffsetRef.current
    )
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
