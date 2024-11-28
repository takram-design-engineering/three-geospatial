import { type Vector2Like } from 'three'

import { type GeodeticLike } from './Geodetic'
import { Rectangle, type RectangleLike } from './Rectangle'
import { TileCoordinate, type TileCoordinateLike } from './TileCoordinate'

export interface TilingSchemeLike {
  readonly width: number
  readonly height: number
  readonly rectangle: RectangleLike
}

export class TilingScheme {
  constructor(
    public width = 2,
    public height = 1,
    public rectangle = Rectangle.MAX
  ) {}

  clone(): TilingScheme {
    return new TilingScheme(this.width, this.height, this.rectangle.clone())
  }

  copy(other: TilingSchemeLike): this {
    this.width = other.width
    this.height = other.height
    this.rectangle.copy(other.rectangle)
    return this
  }

  getSize(z: number): Vector2Like {
    return {
      x: this.width << z,
      y: this.height << z
    }
  }

  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L210
  geodeticToTile(
    geodetic: GeodeticLike,
    z: number,
    result = new TileCoordinate()
  ): TileCoordinate {
    const size = this.getSize(z)
    const width = this.rectangle.width / size.x
    const height = this.rectangle.height / size.y
    let longitude = geodetic.longitude
    if (this.rectangle.east < this.rectangle.west) {
      longitude += Math.PI * 2
    }
    let x = Math.floor((longitude - this.rectangle.west) / width)
    if (x >= size.x) {
      x = size.x - 1
    }
    let y = Math.floor((this.rectangle.north - geodetic.latitude) / height)
    if (y >= size.y) {
      y = size.y - 1
    }
    result.x = x
    result.y = y
    result.z = z
    return result
  }

  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L169
  tileToRectangle(
    tile: TileCoordinateLike,
    result = new Rectangle()
  ): Rectangle {
    const size = this.getSize(tile.z)
    const width = this.rectangle.width / size.x
    const height = this.rectangle.height / size.y
    result.west = tile.x * width + this.rectangle.west
    result.east = (tile.x + 1) * width + this.rectangle.west
    result.north = this.rectangle.north - tile.y * height
    result.south = this.rectangle.north - (tile.y + 1) * height
    return result
  }
}