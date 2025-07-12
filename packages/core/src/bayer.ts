import { Vector2 } from 'three'

// prettier-ignore
export const bayerIndices: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]

export const bayerOffsets: readonly Vector2[] =
  /*#__PURE__*/ bayerIndices.reduce<Vector2[]>((result, _, index) => {
    const offset = new Vector2()
    for (let i = 0; i < 16; ++i) {
      if (bayerIndices[i] === index) {
        offset.set(((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4)
        break
      }
    }
    return [...result, offset]
  }, [])
