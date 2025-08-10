import type { Args } from '@storybook/react-vite'
import { atom, type PrimitiveAtom } from 'jotai'
import { createContext } from 'react'

export const StoryContext = createContext<PrimitiveAtom<Args>>(atom({}))
