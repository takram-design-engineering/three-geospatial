import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FC,
  type KeyboardEvent
} from 'react'

import { Reset } from './icons'
import { IconButton, InputLabel, RangeInput, TextInput } from './ui'

export interface InputRangeProps {
  name: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange?: (value: number) => void
  onReset?: () => void
}

export const InputRange: FC<InputRangeProps> = ({
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

  const id = useId()
  return (
    <>
      <InputLabel htmlFor={id}>{name}</InputLabel>
      <TextInput
        ref={inputRef}
        id={id}
        onKeyDown={handleKeyDown}
        onBlur={handleChange}
      />
      <RangeInput
        ref={sliderRef}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
      />
      <IconButton onClick={onReset}>
        <Reset />
      </IconButton>
    </>
  )
}
