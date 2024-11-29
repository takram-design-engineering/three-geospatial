import { Rectangle } from './Rectangle'
import { TileCoordinate } from './TileCoordinate'
import { TilingScheme } from './TilingScheme'

describe('TilingScheme', () => {
  test('getTile', () => {
    {
      const bounds = Rectangle.MAX
      const tilingScheme = new TilingScheme(2, 1, bounds)
      const tile = new TileCoordinate()

      tilingScheme.getTile(bounds.at(0, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(0.5 - Number.EPSILON, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(0, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(0.5 - Number.EPSILON, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })

      tilingScheme.getTile(bounds.at(0.5 + Number.EPSILON, 0), 0, tile)
      expect(tile).toMatchObject({ x: 1, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(1, 0), 0, tile)
      expect(tile).toMatchObject({ x: 1, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(0.5 + Number.EPSILON, 1), 0, tile)
      expect(tile).toMatchObject({ x: 1, y: 0, z: 0 })
      tilingScheme.getTile(bounds.at(1, 1), 0, tile)
      expect(tile).toMatchObject({ x: 1, y: 0, z: 0 })
    }
    {
      const rect = Rectangle.MAX
      const tilingScheme = new TilingScheme(1, 1, rect)
      const tile = new TileCoordinate()

      tilingScheme.getTile(rect.at(0, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(rect.at(0, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(rect.at(1, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(rect.at(1, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
    }
  })

  test('getRectangle', () => {
    const bounds = Rectangle.MAX
    const tilingScheme = new TilingScheme(2, 1, bounds)
    const rect = new Rectangle()

    tilingScheme.getRectangle({ x: 0, y: 0, z: 0 }, rect)
    expect(rect.west).toBeCloseTo(-Math.PI)
    expect(rect.south).toBeCloseTo(-Math.PI / 2)
    expect(rect.east).toBeCloseTo(0)
    expect(rect.north).toBeCloseTo(Math.PI / 2)

    tilingScheme.getRectangle({ x: 1, y: 0, z: 0 }, rect)
    expect(rect.west).toBeCloseTo(0)
    expect(rect.south).toBeCloseTo(-Math.PI / 2)
    expect(rect.east).toBeCloseTo(Math.PI)
    expect(rect.north).toBeCloseTo(Math.PI / 2)
  })
})
