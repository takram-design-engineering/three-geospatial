import type { Args } from '@storybook/react-vite'
import { getDefaultStore } from 'jotai'
import {
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue
} from 'motion/react'
import { useContext, useEffect, useRef } from 'react'
import { Color } from 'three'

import { springOptions } from './springOptions'
import { StoryContext } from './StoryContext'
import { useCombinedChange } from './useCombinedChange'

export function useSpringControl<TArgs extends Args>(
  selector: (args: TArgs) => number,
  onChange?: (value: number) => void
): MotionValue<number> {
  const argsAtom = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)
  onChange?.(value) // Initial callback

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

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    return springValue.on('change', value => {
      onChangeRef.current?.(value)
    })
  }, [springValue])

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
  const argsAtom = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)
  onChange?.(styleToRGB(value)) // Initial callback

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

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useCombinedChange([springR, springG, springB], rgb => {
    onChangeRef.current?.(rgb)
  })

  return useTransform([springR, springG, springB], ([r, g, b]: number[]) =>
    color.setRGB(r, g, b).getStyle()
  )
}
