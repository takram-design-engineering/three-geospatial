import { Vector3 } from 'three'

import { CloudLayers } from './CloudLayers'

describe('CloudLayers', () => {
  describe('packIntervalHeights', () => {
    test('intervals', () => {
      const layers = new CloudLayers([
        { altitude: 0, height: 1 },
        { altitude: 2, height: 1 },
        { altitude: 4, height: 1 },
        { altitude: 6, height: 1 }
      ])
      const minIntervals = new Vector3()
      const maxIntervals = new Vector3()
      layers.packIntervalHeights(minIntervals, maxIntervals)
      expect(minIntervals.x).toBe(1)
      expect(maxIntervals.x).toBe(2)
      expect(minIntervals.y).toBe(3)
      expect(maxIntervals.y).toBe(4)
      expect(minIntervals.z).toBe(5)
      expect(maxIntervals.z).toBe(6)
    })

    test('intersection', () => {
      const layers = new CloudLayers([
        { altitude: 0, height: 3 },
        { altitude: 2, height: 1 },
        { altitude: 4, height: 2 },
        { altitude: 6, height: 1 }
      ])
      const minIntervals = new Vector3()
      const maxIntervals = new Vector3()
      layers.packIntervalHeights(minIntervals, maxIntervals)
      expect(minIntervals.x).toBe(3)
      expect(maxIntervals.x).toBe(4)
      expect(minIntervals.y).toBe(0)
      expect(maxIntervals.y).toBe(0)
      expect(minIntervals.z).toBe(0)
      expect(maxIntervals.z).toBe(0)
    })

    test('union', () => {
      const layers = new CloudLayers([
        { altitude: 0, height: 3 },
        { altitude: 2, height: 0 },
        { altitude: 4, height: 4 },
        { altitude: 6, height: 1 }
      ])
      const minIntervals = new Vector3()
      const maxIntervals = new Vector3()
      layers.packIntervalHeights(minIntervals, maxIntervals)
      expect(minIntervals.x).toBe(3)
      expect(maxIntervals.x).toBe(4)
      expect(minIntervals.y).toBe(0)
      expect(maxIntervals.y).toBe(0)
      expect(minIntervals.z).toBe(0)
      expect(maxIntervals.z).toBe(0)
    })
  })
})
