import { Vector2 } from 'three'

import { type GeodeticLike } from './Geodetic'
import { Region, type RegionLike } from './Region'
import { TileCoordinate, type TileCoordinateLike } from './TileCoordinate'

const vectorScratch = /*#__PURE__*/ new Vector2()

export interface TilingSchemeLike {
  readonly width: number
  readonly height: number
  readonly region: RegionLike
}

// TODO: Support slippyMap and EPSG:3857
export class TilingScheme {
  constructor(
    public width = 2,
    public height = 1,
    public region = Region.MAX
  ) {}

  clone(): TilingScheme {
    return new TilingScheme(this.width, this.height, this.region.clone())
  }

  copy(other: TilingSchemeLike): this {
    this.width = other.width
    this.height = other.height
    this.region.copy(other.region)
    return this
  }

  getSize(z: number, result = new Vector2()): Vector2 {
    return result.set(this.width << z, this.height << z)
  }

  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L210
  getTile(
    geodetic: GeodeticLike,
    z: number,
    result = new TileCoordinate()
  ): TileCoordinate {
    const size = this.getSize(z, vectorScratch)
    const { region } = this
    const width = region.width / size.x
    const height = region.height / size.y
    const { west, south, east } = region
    let longitude = geodetic.longitude
    if (east < west) {
      longitude += Math.PI * 2
    }
    let x = Math.floor((longitude - west) / width)
    if (x >= size.x) {
      x = size.x - 1
    }
    let y = Math.floor((geodetic.latitude - south) / height)
    if (y >= size.y) {
      y = size.y - 1
    }
    result.x = x
    result.y = y
    result.z = z
    return result
  }

  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L169
  getRegion(tile: TileCoordinateLike, result = new Region()): Region {
    const size = this.getSize(tile.z, vectorScratch)
    const { region } = this
    const width = region.width / size.x
    const height = region.height / size.y
    const { west, north } = region
    result.west = tile.x * width + west
    result.east = (tile.x + 1) * width + west
    result.north = north - (size.y - tile.y - 1) * height
    result.south = north - (size.y - tile.y) * height
    return result
  }

  /** @deprecated Use getRegion instead. */
  getRectangle(...args: Parameters<TilingScheme['getRegion']>): Region {
    return this.getRegion(...args)
  }
}
