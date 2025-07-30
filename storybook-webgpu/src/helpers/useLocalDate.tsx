import { useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'

import { useMaybeMotionValue } from './useMaybeMotionValue'

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

export function useLocalDate(
  longitude: number | MotionValue<number>, // In degrees
  dayOfYear: number | MotionValue<number>,
  timeOfDay: number | MotionValue<number>,
  onChange?: (date: number) => void
): MotionValue<number> {
  const longitudeValue = useMaybeMotionValue(longitude)
  const dayOfYearValue = useMaybeMotionValue(dayOfYear)
  const timeOfDayValue = useMaybeMotionValue(timeOfDay)

  const motionDate = useTransform(
    [longitudeValue, dayOfYearValue, timeOfDayValue],
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
