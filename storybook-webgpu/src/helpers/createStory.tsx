/* eslint-disable react-hooks/rules-of-hooks */

import type { Args, ArgTypes, StoryFn, StoryObj } from '@storybook/react-vite'
import { atom, useSetAtom, type SetStateAction } from 'jotai'
import { memo, useEffect, useMemo, type FC } from 'react'
import { useArgs } from 'storybook/preview-api'

import { StoryContext } from './StoryContext'

export type StoryFC<Props = {}, TArgs = Args> = FC<Props> & {
  [K in keyof StoryFn<TArgs>]: StoryFn<TArgs>[K]
}

// Storybook doesn't provide an option to disable saving the args in URL params.
// It's a bit hacky, but adding an "unsafe" character to the arg names prevents
// it from saving it in URL params.

const prefix = '&'

function maskArgs<TArgs extends Args>(args: TArgs): TArgs {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [`${prefix}${key}`, value])
  ) as TArgs
}

function naturalCase(key: string): string {
  return key.replace(/(?<=[a-zA-Z])(?=[A-Z])/g, ' ').toLowerCase()
}

function maskArgTypes<TArgs extends Args>(
  argTypes?: Partial<ArgTypes<TArgs>>
): Partial<ArgTypes<TArgs>> {
  return argTypes != null
    ? (Object.fromEntries(
        Object.entries(argTypes).map(([key, value]) => [
          `${prefix}${key}`,
          {
            ...value,
            name: value?.name ?? naturalCase(key),
            table:
              value?.table != null
                ? {
                    ...value.table,
                    category: value.table.category?.replace(/ /g, '\u00a0')
                  }
                : undefined
          }
        ])
      ) as Partial<ArgTypes<TArgs>>)
    : {}
}

function unmaskArgs<TArgs extends Args>(args: TArgs): TArgs {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key.slice(prefix.length),
      value
    ])
  ) as TArgs
}

export function createStory<Props, TArgs extends Args>(
  StoryComponent: StoryFC<Props, TArgs>,
  {
    props,
    args: overrideArgs,
    argTypes: overrideArgTypes
  }: {
    props?: Props
    args?: Partial<TArgs>
    argTypes?: Partial<ArgTypes>
  } = {}
): StoryObj {
  const Component = memo(StoryComponent as FC)
  const maskedArgs = maskArgs({ ...StoryComponent.args, ...overrideArgs })
  return {
    render: (args: Args) => {
      // Storybook remembers the values in the args, which I don't like, but it
      // doesn't provide an option to disable it. Reset them to the initial
      // values on being unmounted.
      const [, updateArgs] = useArgs()
      useEffect(() => {
        return () => {
          updateArgs(maskedArgs)
        }
      }, [updateArgs])

      const argsAtom = useMemo(() => {
        const primitive = atom({})
        return atom(
          get => unmaskArgs<Args>(get(primitive)),
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
    args: maskedArgs,
    argTypes: maskArgTypes<TArgs>({
      ...StoryComponent.argTypes,
      ...overrideArgTypes
    })
  }
}
