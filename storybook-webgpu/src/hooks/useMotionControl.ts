import type { Args } from '@storybook/react-vite'
import { getDefaultStore } from 'jotai'
import {
  useMotionValue,
  useMotionValueEvent,
  type MotionValue
} from 'motion/react'
import { useContext, useEffect, useRef } from 'react'

import { StoryContext } from '../helpers/StoryContext'

export function useMotionControl<TArgs extends Args, U>(
  selector: (args: TArgs) => U,
  onChange?: (value: U) => void
): MotionValue<U> {
  const { argsAtom } = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)

  // Transient update on the spring value.
  const motionValue = useMotionValue(value)
  motionValue.set(value)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  useEffect(() => {
    return store.sub(argsAtom, () => {
      const value = selectorRef.current(store.get(argsAtom) as TArgs)
      motionValue.set(value)
    })
  }, [argsAtom, store, motionValue])

  onChange?.(value) // Initial callback
  useMotionValueEvent(motionValue, 'change', value => {
    onChange?.(value)
  })

  return motionValue
}
