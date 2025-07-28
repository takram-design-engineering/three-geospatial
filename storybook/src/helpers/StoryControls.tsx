import type { ArgTypes, StoryFn, StoryObj } from '@storybook/react-vite'
import { useSpring, type MotionValue } from 'framer-motion'
import {
  atom,
  getDefaultStore,
  useAtomValue,
  useSetAtom,
  type PrimitiveAtom,
  type SetStateAction
} from 'jotai'
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

export type Args = Record<string, any>

export type StoryFC<Props = {}, TArgs = Args> = FC<Props> & {
  [K in keyof StoryFn<TArgs>]: StoryFn<TArgs>[K]
}

export const StoryContext = createContext<PrimitiveAtom<Args>>(atom({}))

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
  props?: Props,
  overrideArgs?: TArgs
): StoryObj {
  const Component = memo(StoryComponent as FC)
  return {
    render: (args: Args) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
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

      // eslint-disable-next-line react-hooks/rules-of-hooks
      useSetAtom(argsAtom)(args)
      return (
        <StoryContext value={argsAtom}>
          <Component {...props} />
        </StoryContext>
      )
    },
    args: maskArgs({
      ...StoryComponent.args,
      ...overrideArgs
    }),
    argTypes: maskArgTypes<TArgs>(StoryComponent.argTypes)
  }
}

export function useControl<TArgs extends Args, T>(
  selector: (args: TArgs) => T
): T {
  const argsAtom = useContext(StoryContext)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  // The selector function must be stable.
  const selectorCallback = useCallback((args: TArgs) => {
    return selectorRef.current(args)
  }, [])
  return useAtomValue(
    selectAtom(argsAtom as PrimitiveAtom<TArgs>, selectorCallback)
  )
}

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
    if (value !== prevValueRef.current) {
      onChange(value, prevValueRef.current)
      prevValueRef.current = value
    }
  })
}

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
