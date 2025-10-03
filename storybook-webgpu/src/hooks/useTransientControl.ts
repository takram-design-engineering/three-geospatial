import type { Args } from '@storybook/react-vite'
import { getDefaultStore } from 'jotai'
import { useContext, useEffect, useRef } from 'react'
import shallowEqual from 'shallowequal'

import { StoryContext } from '../helpers/StoryContext'

export function useTransientControl<TArgs extends Args, const T>(
  selector: (args: TArgs) => T,
  onChange:
    | ((value: T, prevValue?: T) => void)
    | ((value: T, prevValue?: T) => () => void)
): void {
  const { argsAtom } = useContext(StoryContext)
  const store = getDefaultStore()
  const value = selector(store.get(argsAtom) as TArgs)
  onChange(value) // Initial callback

  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const prevValueRef = useRef(value)
  useEffect(() => {
    return store.sub(argsAtom, () => {
      const value = selectorRef.current(store.get(argsAtom) as TArgs)
      if (!shallowEqual(value, prevValueRef.current)) {
        const result = onChangeRef.current(value, prevValueRef.current)
        prevValueRef.current = value
        return result
      }
    })
  }, [argsAtom, store])
}
