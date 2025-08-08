/* eslint-disable react-hooks/rules-of-hooks */

import type { Args, ArgTypes, StoryFn, StoryObj } from '@storybook/react-vite'
import { atom, useSetAtom, type SetStateAction } from 'jotai'
import { memo, useEffect, useMemo, type FC } from 'react'
import { useArgs } from 'storybook/preview-api'

import { StoryContext } from './StoryContext'

export type StoryFC<Props = {}, TArgs = Args> = FC<Props> & {
  [K in keyof StoryFn<TArgs>]: StoryFn<TArgs>[K]
}

function naturalCase(key: string): string {
  return key.replace(/(?<=[a-zA-Z])(?=[A-Z])/g, ' ').toLowerCase()
}

function formatArgTypes<TArgs extends Args>(
  argTypes?: Partial<ArgTypes<TArgs>>
): Partial<ArgTypes<TArgs>> {
  return argTypes != null
    ? (Object.fromEntries(
        Object.entries(argTypes).map(([key, value]) => [
          key,
          {
            ...value,
            name: value?.name ?? naturalCase(key)
          }
        ])
      ) as Partial<ArgTypes<TArgs>>)
    : {}
}

// TODO: Somehow prevent Storybook from storing args state in URL parameters,
// because it triggers re-rendering of the entire tree and computationally too
// heavy.

export function createStory<Props, TArgs extends Args>(
  StoryComponent: StoryFC<Props, TArgs>,
  {
    props,
    args: overrideArgs,
    argTypes: overrideArgTypes,
    ...others
  }: {
    props?: Props
  } & Omit<StoryObj, 'render'> = {}
): StoryObj {
  const Component = memo(StoryComponent as FC)
  const initialArgs = { ...StoryComponent.args, ...overrideArgs }
  return {
    ...others,
    render: (args: Args) => {
      // Storybook remembers the values in the args, which I don't like, but it
      // doesn't provide an option to disable it. Reset them to the initial
      // values on being unmounted.
      const [, updateArgs] = useArgs()
      useEffect(() => {
        return () => {
          updateArgs(initialArgs)
        }
      }, [updateArgs])

      const argsAtom = useMemo(() => {
        const primitive = atom({})
        return atom(
          get => get(primitive),
          (get, set, value: SetStateAction<Args>) => {
            set(
              primitive,
              typeof value === 'function' ? value(get(primitive)) : value
            )
          }
        )
      }, [])

      useSetAtom(argsAtom)(args)
      return (
        <StoryContext value={argsAtom}>
          <Component {...props} />
        </StoryContext>
      )
    },
    args: initialArgs,
    argTypes: formatArgTypes({
      ...StoryComponent.argTypes,
      ...overrideArgTypes
    })
  }
}
