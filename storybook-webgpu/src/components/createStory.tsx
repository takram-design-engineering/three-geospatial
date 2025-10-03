/* eslint-disable react-hooks/rules-of-hooks */

import type { Args, ArgTypes, StoryFn, StoryObj } from '@storybook/react-vite'
import { atom, useSetAtom, type SetStateAction } from 'jotai'
import { memo, useEffect, useMemo, type FC } from 'react'
import { useArgs } from 'storybook/preview-api'

import { StoryContext } from '../helpers/StoryContext'

export type StoryFC<Props = {}, TArgs = Args> = FC<
  Props & {
    updateArgs: (args: Partial<TArgs>) => void
  }
> & {
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

export function createStory<Props, TArgs extends Args>(
  StoryComponent: StoryFC<Props, TArgs>,
  {
    props,
    args: overrideArgs,
    argTypes: overrideArgTypes,
    ...others
  }: {
    props?: Props
  } & Partial<Omit<StoryObj<TArgs>, 'render'>> = {}
): StoryObj {
  const Component = memo(StoryComponent) as any
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

      const context = useMemo(
        () => ({ argsAtom, updateArgs }),
        [argsAtom, updateArgs]
      )
      return (
        <StoryContext value={context}>
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
