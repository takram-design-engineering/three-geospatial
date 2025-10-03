import type { Args } from '@storybook/react-vite'
import { getDefaultStore } from 'jotai'
import {
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue
} from 'motion/react'
import { useContext, useEffect, useRef } from 'react'
import { Color } from 'three'

import { springOptions } from '../helpers/springOptions'
import { StoryContext } from '../helpers/StoryContext'
import { useCombinedChange } from './useCombinedChange'

export function useSpringControl<TArgs extends Args>(
  selector: (args: TArgs) => number,
  onChange?: (value: number) => void
): MotionValue<number> {
  const { argsAtom } = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)

  // Transient update on the spring value.
  const springValue = useSpring(value, springOptions)
  springValue.set(value)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  useEffect(() => {
    return store.sub(argsAtom, () => {
      const value = selectorRef.current(store.get(argsAtom) as TArgs)
      springValue.set(value)
    })
  }, [argsAtom, store, springValue])

  onChange?.(value) // Initial callback
  useMotionValueEvent(springValue, 'change', value => {
    onChange?.(value)
  })

  return springValue
}

const color = new Color()

function styleToRGB(style: string): [number, number, number] {
  color.setStyle(style)
  return [color.r, color.g, color.b]
}

export function useSpringColorControl<TArgs extends Args>(
  selector: (args: TArgs) => string,
  onChange?: (value: [number, number, number]) => void
): MotionValue<string> {
  const { argsAtom } = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)

  const style = useMotionValue(value)
  style.set(value)

  const springR = useSpring(
    useTransform(style, value => styleToRGB(value)[0]),
    springOptions
  )
  const springG = useSpring(
    useTransform(style, value => styleToRGB(value)[1]),
    springOptions
  )
  const springB = useSpring(
    useTransform(style, value => styleToRGB(value)[2]),
    springOptions
  )

  const selectorRef = useRef(selector)
  selectorRef.current = selector
  useEffect(() => {
    return store.sub(argsAtom, () => {
      const value = selectorRef.current(store.get(argsAtom) as TArgs)
      style.set(value)
    })
  }, [argsAtom, store, style])

  onChange?.(styleToRGB(value)) // Initial callback
  useCombinedChange([springR, springG, springB], rgb => {
    onChange?.(rgb)
  })

  return useTransform([springR, springG, springB], ([r, g, b]: number[]) =>
    color.setRGB(r, g, b).getStyle()
  )
}
