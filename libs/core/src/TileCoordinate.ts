export type TileCoordinateTuple = [number, number, number]

export interface TileCoordinateLike {
  readonly x: number
  readonly y: number
  readonly z: number
}

export class TileCoordinate {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x
    this.y = y
    this.z = z
    return this
  }

  clone(): TileCoordinate {
    return new TileCoordinate(this.x, this.y, this.z)
  }

  copy(other: TileCoordinateLike): this {
    this.x = other.x
    this.y = other.y
    this.z = other.z
    return this
  }

  equals(other: TileCoordinateLike): boolean {
    return other.x === this.x && other.y === this.y && other.z === this.z
  }

  setX(value: number): this {
    this.x = value
    return this
  }

  setY(value: number): this {
    this.y = value
    return this
  }

  setZ(value: number): this {
    this.z = value
    return this
  }

  getParent(result = new TileCoordinate()): TileCoordinate {
    const divisor = 2 ** this.z
    const x = this.x / divisor
    const y = this.y / divisor
    const z = this.z - 1
    const scale = 2 ** z
    return result.set(Math.floor(x * scale), Math.floor(y * scale), z)
  }

  getChildren(
    result = [
      new TileCoordinate(),
      new TileCoordinate(),
      new TileCoordinate(),
      new TileCoordinate()
    ],
    offset = 0
  ): TileCoordinate[] {
    const divisor = 2 ** this.z
    const z = this.z + 1
    const scale = 2 ** z
    const x = Math.floor((this.x / divisor) * scale)
    const y = Math.floor((this.y / divisor) * scale)
    result[offset]?.set(x, y, z)
    result[offset + 1]?.set(x + 1, y, z)
    result[offset + 2]?.set(x, y + 1, z)
    result[offset + 3]?.set(x + 1, y + 1, z)
    return result
  }

  fromArray(array: readonly number[], offset = 0): this {
    this.x = array[offset]
    this.y = array[offset + 1]
    this.z = array[offset + 2]
    return this
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.x
    array[offset + 1] = this.y
    array[offset + 2] = this.z
    return array
  }

  *[Symbol.iterator](): Generator<number> {
    yield this.x
    yield this.y
    yield this.z
  }
}
