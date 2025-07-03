import type { MathType, MathTypes } from '@react-three/fiber'

export type OverwriteMathProps<T> = {
  [K in keyof T]: Exclude<T[K], undefined> extends MathTypes
    ? T[K] extends undefined
      ? MathType<Exclude<T[K], undefined>> | undefined
      : MathType<Exclude<T[K], undefined>>
    : T[K]
}

export type ExpandNestedProps<T, Prop extends keyof T & string> = {
  [K in keyof NonNullable<T[Prop]> as K extends string
    ? `${Prop}-${K}`
    : 'never']: NonNullable<T[Prop]>[K]
}
