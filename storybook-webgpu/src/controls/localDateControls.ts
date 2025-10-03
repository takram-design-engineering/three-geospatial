import type { ArgTypes } from '@storybook/react-vite'
import { MotionValue, useMotionValueEvent, useTransform } from 'motion/react'

import { useMaybeMotionValue } from '../hooks/useMaybeMotionValue'
import { useMotionControl } from '../hooks/useMotionControl'
import { useSpringControl } from '../hooks/useSpringControl'
import type { LocationArgs } from './locationControls'

export interface LocalDateArgs {
  dayOfYear: number
  timeOfDay: number
  year: number
}

export const localDateArgs = (
  defaults?: Partial<LocalDateArgs>
): LocalDateArgs => ({
  dayOfYear: 0,
  timeOfDay: 0,
  year: new Date().getFullYear(),
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
  },
  year: {
    control: {
      type: 'range',
      min: 2000,
      max: 2050
    },
    table: { category: 'local date' }
  }
})

function getLocalDate(
  longitude: number,
  dayOfYear: number,
  timeOfDay: number,
  year: number
): number {
  const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0)
  const offset = longitude / 15
  return epoch + ((dayOfYear - 1) * 24 + timeOfDay - offset) * 3600000
}

export function useLocalDateControls(
  longitude: number | MotionValue<number>,
  onChange?: (date: number) => void
): MotionValue<number>

export function useLocalDateControls(
  onChange?: (date: number) => void
): MotionValue<number>

export function useLocalDateControls(
  arg1?: number | MotionValue<number> | ((date: number) => void),
  arg2?: (date: number) => void
): MotionValue<number> {
  const [longitudeParam, onChange] =
    typeof arg1 === 'number' || arg1 instanceof MotionValue
      ? [arg1, arg2]
      : [undefined, arg1]

  const longitude =
    longitudeParam != null
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useMaybeMotionValue(longitudeParam)
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useSpringControl(
          ({ longitude }: Partial<LocationArgs>) => longitude ?? 0
        )

  const dayOfYear = useSpringControl(
    ({ dayOfYear }: LocalDateArgs) => dayOfYear
  )
  const timeOfDay = useSpringControl(
    ({ timeOfDay }: LocalDateArgs) => timeOfDay
  )
  const year = useMotionControl(({ year }: LocalDateArgs) => year)

  const motionDate = useTransform(
    [longitude, dayOfYear, timeOfDay, year],
    ([longitude, dayOfYear, timeOfDay, year]: number[]) => {
      return getLocalDate(longitude, Math.floor(dayOfYear), timeOfDay, year)
    }
  )

  onChange?.(motionDate.get()) // Initial callback
  useMotionValueEvent(motionDate, 'change', value => {
    onChange?.(value)
  })

  return motionDate
}
