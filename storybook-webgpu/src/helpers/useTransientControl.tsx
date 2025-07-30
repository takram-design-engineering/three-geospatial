import type { Args } from '@storybook/react-vite'
import { getDefaultStore } from 'jotai'
import { useContext, useRef } from 'react'
import shallowEqual from 'shallowequal'

import { StoryContext } from './StoryContext'

export function useTransientControl<TArgs extends Args, T>(
  selector: (args: TArgs) => T,
  onChange: (value: T, prevValue?: T) => void
): void {
  const argsAtom = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)
  onChange(value) // Initial callback

  const prevValueRef = useRef(value)
  store.sub(argsAtom, () => {
    const value = selector(store.get(argsAtom) as TArgs)
    if (!shallowEqual(value, prevValueRef.current)) {
      onChange(value, prevValueRef.current)
      prevValueRef.current = value
    }
  })
}
