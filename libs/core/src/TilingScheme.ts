import { type Vector2Like } from 'three'

import { type CartographicLike } from './Cartographic'
import { Rectangle } from './Rectangle'
import { TileCoordinate, type TileCoordinateLike } from './TileCoordinate'

export interface TilingSchemeParams {
  width?: number
  height?: number
  rectangle?: Rectangle
}

export class TilingScheme {
  readonly width: number
  readonly height: number
  readonly rectangle: Rectangle

  constructor({
    width = 2,
    height = 1,
    rectangle = Rectangle.MAX
  }: TilingSchemeParams = {}) {
    this.width = width
    this.height = height
    this.rectangle = rectangle
  }

  getSize(z: number): Vector2Like {
    return {
      x: this.width << z,
      y: this.height << z
    }
  }

  cartographicToTile(
    cartographic: CartographicLike,
    z: number,
    result = new TileCoordinate()
  ): TileCoordinate {
    const size = this.getSize(z)
    const width = this.rectangle.width / size.x
    const height = this.rectangle.height / size.y
    let longitude = cartographic.longitude
    if (this.rectangle.east < this.rectangle.west) {
      longitude += Math.PI * 2
    }
    let x = Math.floor((longitude - this.rectangle.west) / width)
    if (x >= size.x) {
      x = size.x - 1
    }
    let y = Math.floor((this.rectangle.north - cartographic.latitude) / height)
    if (y >= size.y) {
      y = size.y - 1
    }
    result.x = x
    result.y = y
    result.z = z
    return result
  }

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
