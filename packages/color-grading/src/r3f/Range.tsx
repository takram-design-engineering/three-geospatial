import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FC,
  type KeyboardEvent
} from 'react'

import { IconButton, Input, Label, ResetIcon, Slider } from './ui'

export interface RangeProps {
  name: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange?: (value: number) => void
  onReset?: () => void
}

export const Range: FC<RangeProps> = ({
  name,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onReset
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (input != null) {
      input.value = value.toFixed(2)
    }
    const slider = sliderRef.current
    if (slider != null) {
      slider.value = value.toFixed(2)
    }
  }, [value])

  const valueRef = useRef(value)
  valueRef.current = value

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handle = useCallback((target: HTMLInputElement) => {
    const value = parseFloat(target.value)
    if (!isNaN(value)) {
      onChangeRef.current?.(value)
    } else {
      target.value = valueRef.current.toFixed(2)
    }
  }, [])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handle(event.currentTarget)
    },
    [handle]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handle(event.currentTarget)
      }
    },
    [handle]
  )

  return (
    <>
      <Label>{name}</Label>
      <Input
        ref={inputRef}
        type='text'
        onKeyDown={handleKeyDown}
        onBlur={handleChange}
      />
      <Slider
        ref={sliderRef}
        type='range'
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
      />
      <IconButton onClick={onReset}>
        <ResetIcon />
      </IconButton>
    </>
  )
}
