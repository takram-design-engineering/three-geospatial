/* eslint-disable react-hooks/rules-of-hooks */

import { useThree } from '@react-three/fiber'
import type { ArgTypes, StoryFn, StoryObj } from '@storybook/react-vite'
import { useSpring, type MotionValue } from 'framer-motion'
import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from 'jotai'
import { selectAtom } from 'jotai/utils'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type FC
} from 'react'

import { springOptions } from './springOptions'

export const StoryContext = createContext(atom<Record<string, any>>({}))

// Storybook doesn't provide an option to disable saving the args in URL params.
// It's a bit hacky, but adding an "unsafe" character to the arg names prevents
// it from saving it in URL params.

const prefix = '&'

function obfuscate<Args extends Record<string, any>>(args: Args): Args {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [`${prefix}${key}`, value])
  ) as Args
}

function naturalCase(key: string): string {
  return key.replace(/(?<=[a-zA-Z])(?=[A-Z])/g, ' ').toLowerCase()
}

function obfuscateTypes<Args extends Record<string, any>>(
  args?: Partial<ArgTypes<Args>>
): Partial<ArgTypes<Args>> {
  return args != null
    ? (Object.fromEntries(
        Object.entries(args).map(([key, value]) => [
          `${prefix}${key}`,
          { ...value, name: naturalCase(key) }
        ])
      ) as Partial<ArgTypes<Args>>)
    : {}
}

function deobfuscate<Args extends Record<string, any>>(args: Args): Args {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key.slice(prefix.length),
      value
    ])
  ) as Args
}

export function createStory<Args extends Record<string, any>>(
  StoryComponent: StoryFn<Args>,
  overrideArgs?: Args
): StoryObj {
  const Component = memo(StoryComponent as FC)
  return {
    render: (args: Record<string, any>) => {
      const argsAtom = useMemo(() => atom({}), [])
      useSetAtom(argsAtom)(args)
      return (
        <StoryContext value={argsAtom}>
          <Component />
        </StoryContext>
      )
    },
    args: obfuscate({
      ...StoryComponent.args,
      ...overrideArgs
    }),
    argTypes: obfuscateTypes<Args>(StoryComponent.argTypes)
  }
}

export function useControl<Args extends Record<string, any>, T>(
  selector: (args: Args, prevValue?: T) => T
): T {
  const argsAtom = useContext(StoryContext)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  // The selector function must be stable.
  const selectorCallback = useCallback((args: Args, prevValue?: T) => {
    return selectorRef.current(deobfuscate<Args>(args), prevValue)
  }, [])
  return useAtomValue(
    selectAtom(argsAtom as PrimitiveAtom<Args>, selectorCallback)
  )
}

export function useSpringControl<Args extends Record<string, any>>(
  selector: (args: Args, prevValue?: number) => number,
  onChange?: (value: number) => void
): MotionValue<number> {
  const value = useControl(selector)
  const springValue = useSpring(value, springOptions)
  springValue.set(value)
  onChange?.(springValue.get())

  const { invalidate } = useThree()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    springValue.on('change', () => {
      onChangeRef.current?.(springValue.get())
      invalidate() // For the "demand" frameloop
    })
  }, [springValue, invalidate])

  return springValue
}
