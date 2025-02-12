import { Vector3, Vector4 } from 'three'

import { packIntervalHeights } from './uniforms'

describe('packIntervalHeights', () => {
  test('intervals', () => {
    const min = new Vector4(0, 2, 4, 6)
    const max = new Vector4(1, 3, 5, 7)
    const minIntervals = new Vector3()
    const maxIntervals = new Vector3()
    packIntervalHeights(min, max, minIntervals, maxIntervals)
    expect(minIntervals.x).toBe(1)
    expect(maxIntervals.x).toBe(2)
    expect(minIntervals.y).toBe(3)
    expect(maxIntervals.y).toBe(4)
    expect(minIntervals.z).toBe(5)
    expect(maxIntervals.z).toBe(6)
  })

  test('intersection', () => {
    const min = new Vector4(0, 2, 4, 6)
    const max = new Vector4(3, 3, 6, 7)
    const minIntervals = new Vector3()
    const maxIntervals = new Vector3()
    packIntervalHeights(min, max, minIntervals, maxIntervals)
    expect(minIntervals.x).toBe(3)
    expect(maxIntervals.x).toBe(4)
    expect(minIntervals.y).toBe(0)
    expect(maxIntervals.y).toBe(0)
    expect(minIntervals.z).toBe(0)
    expect(maxIntervals.z).toBe(0)
  })

  test('union', () => {
    const min = new Vector4(0, 2, 4, 6)
    const max = new Vector4(3, 2, 8, 7)
    const minIntervals = new Vector3()
    const maxIntervals = new Vector3()
    packIntervalHeights(min, max, minIntervals, maxIntervals)
    expect(minIntervals.x).toBe(3)
    expect(maxIntervals.x).toBe(4)
    expect(minIntervals.y).toBe(0)
    expect(maxIntervals.y).toBe(0)
    expect(minIntervals.z).toBe(0)
    expect(maxIntervals.z).toBe(0)
  })
})
