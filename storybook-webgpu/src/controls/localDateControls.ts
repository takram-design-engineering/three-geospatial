import type { ArgTypes } from '@storybook/react-vite'
import { useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef } from 'react'

import { useMaybeMotionValue } from '../helpers/useMaybeMotionValue'
import { useSpringControl } from '../helpers/useSpringControl'

export interface LocalDateArgs {
  dayOfYear: number
  timeOfDay: number
}

export const localDateArgs = (
  defaults?: Partial<LocalDateArgs>
): LocalDateArgs => ({
  dayOfYear: 0,
  timeOfDay: 0,
  ...defaults
})

export const localDateArgTypes = (): ArgTypes<LocalDateArgs> => ({
  dayOfYear: {
    control: {
      type: 'range',
      min: 1,
      max: 365,
      step: 1
    },
    table: { category: 'local date' }
  },
  timeOfDay: {
    control: {
      type: 'range',
      min: 0,
      max: 24,
      step: 0.1
    },
    table: { category: 'local date' }
  }
})

function getLocalDate(
  longitude: number,
  dayOfYear: number,
  timeOfDay: number
): number {
  const year = new Date().getFullYear()
  const [epoch, offset] =
    longitude != null
      ? [Date.UTC(year, 0, 1, 0, 0, 0, 0), longitude / 15]
      : [+new Date(year, 0, 1, 0, 0, 0, 0), 0]
  return epoch + (Math.floor(dayOfYear) * 24 + timeOfDay - offset) * 3600000
}

export function useLocalDateControls(
  longitude: number | MotionValue<number>, // In degrees
  onChange?: (date: number) => void
): MotionValue<number> {
  const motionLongitude = useMaybeMotionValue(longitude)
  const dayOfYear = useSpringControl(
    ({ dayOfYear }: LocalDateArgs) => dayOfYear
  )
  const timeOfDay = useSpringControl(
    ({ timeOfDay }: LocalDateArgs) => timeOfDay
  )

  const motionDate = useTransform(
    [motionLongitude, dayOfYear, timeOfDay],
    ([longitude, dayOfYear, timeOfDay]: number[]) =>
      getLocalDate(longitude, dayOfYear, timeOfDay)
  )

  onChange?.(motionDate.get()) // Initial callback

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    return motionDate.on('change', date => {
      onChangeRef.current?.(date)
    })
  }, [motionDate])

  return motionDate
}
