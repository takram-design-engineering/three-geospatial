import type { Args } from '@storybook/react-vite'
import { useSpring, type MotionValue } from 'framer-motion'
import { getDefaultStore } from 'jotai'
import { useContext, useEffect, useRef } from 'react'

import { springOptions } from './springOptions'
import { StoryContext } from './StoryContext'

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
  store.sub(argsAtom, () => {
    const value = selector(store.get(argsAtom) as TArgs)
    springValue.set(value)
  })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    return springValue.on('change', value => {
      onChangeRef.current?.(value)
    })
  }, [springValue])

  return springValue
}
