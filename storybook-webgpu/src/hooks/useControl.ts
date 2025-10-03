import type { Args } from '@storybook/react-vite'
import { useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { useCallback, useContext, useRef } from 'react'
import shallowEqual from 'shallowequal'

import { StoryContext } from '../helpers/StoryContext'

export function useControl<TArgs extends Args, T>(
  selector: (args: TArgs) => T
): T {
  const { argsAtom } = useContext(StoryContext)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  // The selector function must be stable.
  const selectorCallback = useCallback((args: Args) => {
    return selectorRef.current(args as TArgs)
  }, [])
  return useAtomValue(selectAtom(argsAtom, selectorCallback, shallowEqual))
}
