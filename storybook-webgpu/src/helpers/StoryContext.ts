import type { Args } from '@storybook/react-vite'
import { atom, type PrimitiveAtom } from 'jotai'
import { createContext } from 'react'

export interface StoryContextValue {
  argsAtom: PrimitiveAtom<Args>
  updateArgs?: (newArgs: Partial<Args>) => void
}

export const StoryContext = createContext<StoryContextValue>({
  argsAtom: atom({})
})
