import {
  addMilliseconds,
  getDayOfYear,
  setDayOfYear,
  setHours,
  startOfDay
} from 'date-fns'
import { useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useControls } from 'leva'

const MILLISECONDS_PER_DAY = 3600000

const referenceDate = setHours(new Date(), 9)

export function useMotionDate(): MotionValue<number> {
  const { dayOfYear, timeOfDay } = useControls('date', {
    dayOfYear: {
      value: getDayOfYear(referenceDate),
      min: 1,
      max: 365,
      step: 1
    },
    timeOfDay: {
      value:
        (+referenceDate - +startOfDay(referenceDate)) / MILLISECONDS_PER_DAY,
      min: 0,
      max: 24
    }
  })

  const springConfig = { mass: 1, damping: 20 }
  const springDayOfYear = useSpring(dayOfYear, springConfig)
  const springTimeOfDay = useSpring(timeOfDay, springConfig)
  springDayOfYear.set(dayOfYear)
  springTimeOfDay.set(timeOfDay)

  return useTransform<number, number>(
    [springDayOfYear, springTimeOfDay],
    ([dayOfYear, timeOfDay]) =>
      +addMilliseconds(
        startOfDay(setDayOfYear(referenceDate, dayOfYear)),
        timeOfDay * MILLISECONDS_PER_DAY
      )
  )
}
