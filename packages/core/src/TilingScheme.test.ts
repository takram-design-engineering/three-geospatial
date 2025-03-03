import { Region } from './Region'
import { TileCoordinate } from './TileCoordinate'
import { TilingScheme } from './TilingScheme'

describe('TilingScheme', () => {
  test('getTile', () => {
    {
      const bounds = Region.MAX
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
      const region = Region.MAX
      const tilingScheme = new TilingScheme(1, 1, region)
      const tile = new TileCoordinate()

      tilingScheme.getTile(region.at(0, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(region.at(0, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(region.at(1, 0), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
      tilingScheme.getTile(region.at(1, 1), 0, tile)
      expect(tile).toMatchObject({ x: 0, y: 0, z: 0 })
    }
  })

  test('getRegion', () => {
    const bounds = Region.MAX
    const tilingScheme = new TilingScheme(2, 1, bounds)
    const region = new Region()

    tilingScheme.getRegion({ x: 0, y: 0, z: 0 }, region)
    expect(region.west).toBeCloseTo(-Math.PI)
    expect(region.south).toBeCloseTo(-Math.PI / 2)
    expect(region.east).toBeCloseTo(0)
    expect(region.north).toBeCloseTo(Math.PI / 2)

    tilingScheme.getRegion({ x: 1, y: 0, z: 0 }, region)
    expect(region.west).toBeCloseTo(0)
    expect(region.south).toBeCloseTo(-Math.PI / 2)
    expect(region.east).toBeCloseTo(Math.PI)
    expect(region.north).toBeCloseTo(Math.PI / 2)
  })
})
