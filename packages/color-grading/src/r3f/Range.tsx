import type { ChangeEvent, FC, MouseEvent } from 'react'

import { IconButton, Input, Label, ResetIcon, Slider } from './ui'

export interface RangeProps {
  name: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  onReset?: (event: MouseEvent<HTMLButtonElement>) => void
}

export const Range: FC<RangeProps> = ({
  name,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onReset
}) => (
  <>
    <Label>{name}</Label>
    <Input type='text' value={value.toFixed(2)} onChange={onChange} />
    <Slider
      type='range'
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
    <IconButton onClick={onReset}>
      <ResetIcon />
    </IconButton>
  </>
)
