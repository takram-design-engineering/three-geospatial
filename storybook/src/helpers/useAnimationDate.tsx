import { useFrame } from '@react-three/fiber'
import {
  addMilliseconds,
  getDayOfYear,
  set,
  setDayOfYear,
  startOfDay
} from 'date-fns'
import {
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue
} from 'framer-motion'

import { useControls } from './useControls'

const MILLISECONDS_PER_DAY = 3600000

const referenceDate = set(new Date(), {
  hours: 0,
  minutes: 0,
  seconds: 0,
  milliseconds: 0
})

export function useAnimationDate(): MotionValue<number> {
  const { dayOfYear } = useControls('date', {
    dayOfYear: {
      value: getDayOfYear(referenceDate),
      min: 1,
      max: 365,
      step: 1
    }
  })

  const springConfig = { mass: 1, damping: 20 }
  const springDayOfYear = useSpring(dayOfYear, springConfig)
  const motionTimeOfDay = useMotionValue(
    (+referenceDate - +startOfDay(referenceDate)) / MILLISECONDS_PER_DAY
  )
  springDayOfYear.set(dayOfYear)

  useFrame(() => {
    motionTimeOfDay.set(motionTimeOfDay.get() + 0.01)
  })

  return useTransform<number, number>(
    [springDayOfYear, motionTimeOfDay],
    ([dayOfYear, timeOfDay]) =>
      +addMilliseconds(
        startOfDay(setDayOfYear(referenceDate, dayOfYear)),
        timeOfDay * MILLISECONDS_PER_DAY
      )
  )
}
