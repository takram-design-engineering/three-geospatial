import { useFrame, useThree } from '@react-three/fiber'
import { getDayOfYear } from 'date-fns'
import { button } from 'leva'
import type { FolderSettings } from 'leva/dist/declarations/src/types'
import { useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

import { springOptions } from './springOptions'
import { useControls } from './useControls'

const year = /*#__PURE__*/ new Date().getFullYear()

export interface LocalDateControlsParams {
  longitude?: number // In degrees
  dayOfYear?: number
  timeOfDay?: number
}

export function useLocalDateControls(
  {
    longitude,
    dayOfYear: initialDayOfYear = getDayOfYear(new Date()),
    timeOfDay: initialTimeOfDay = 9
  }: LocalDateControlsParams = {},
  folderSettings?: FolderSettings
): MotionValue<number> {
  const [animated, setAnimated] = useState(false)
  const [{ dayOfYear, timeOfDay, speed }, set] = useControls(
    'local date',
    () => ({
      dayOfYear: {
        value: initialDayOfYear,
        min: 1,
        max: 365, // Ignore leap year
        step: 1
      },
      timeOfDay: {
        value: initialTimeOfDay,
        min: 0,
        max: 24,
        step: 0.1
      },
      speed: {
        value: 0.05,
        min: -0.5,
        max: 0.5
      },
      ...(animated
        ? {
            stop: button(() => {
              setAnimated(false)
              set({
                timeOfDay: springTimeOfDay.get()
              })
            })
          }
        : {
            animate: button(() => {
              setAnimated(true)
            })
          })
    }),
    folderSettings ?? {},
    [animated]
  )

  const springDayOfYear = useSpring(dayOfYear, springOptions)
  const springTimeOfDay = useSpring(timeOfDay, springOptions)
  springDayOfYear.set(dayOfYear)
  springTimeOfDay.set(timeOfDay)

  const getDate = useMemo(() => {
    const [epoch, offset] =
      longitude != null
        ? [Date.UTC(year, 0, 1, 0, 0, 0, 0), longitude / 15]
        : [+new Date(year, 0, 1, 0, 0, 0, 0), 0]
    return (dayOfYear: number, timeOfDay: number) =>
      epoch + (Math.floor(dayOfYear) * 24 + timeOfDay - offset) * 3600000
  }, [longitude])

  const date = useMotionValue(0)
  useEffect(() => {
    date.set(getDate(springDayOfYear.get(), springTimeOfDay.get()))
    const offs = [
      springDayOfYear.on('change', value => {
        date.set(getDate(value, springTimeOfDay.get()))
      }),
      springTimeOfDay.on('change', value => {
        date.set(getDate(springDayOfYear.get(), value))
      })
    ]
    return () => {
      offs.forEach(off => {
        off()
      })
    }
  }, [date, springDayOfYear, springTimeOfDay, getDate])

  const { invalidate } = useThree()
  useEffect(() => {
    const offs = [
      springDayOfYear.on('change', () => {
        invalidate()
      }),
      springTimeOfDay.on('change', () => {
        invalidate()
      })
    ]
    return () => {
      offs.forEach(off => {
        off()
      })
    }
  }, [springDayOfYear, springTimeOfDay, invalidate])

  useFrame(() => {
    if (animated) {
      springTimeOfDay.set((springTimeOfDay.get() + speed) % 24)
    }
  })

  return date
}
