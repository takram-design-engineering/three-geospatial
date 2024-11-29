export type TileCoordinateTuple = [number, number, number]

export interface TileCoordinateLike {
  readonly x: number
  readonly y: number
  readonly z: number
}

function* traverseChildren(
  x: number,
  y: number,
  z: number,
  maxZ: number,
  result?: TileCoordinate
): Generator<TileCoordinate> {
  if (z >= maxZ) {
    return
  }
  const divisor = 2 ** z
  const nextZ = z + 1
  const scale = 2 ** nextZ
  const nextX = Math.floor((x / divisor) * scale)
  const nextY = Math.floor((y / divisor) * scale)
  const children = [
    [nextX, nextY, nextZ],
    [nextX + 1, nextY, nextZ],
    [nextX, nextY + 1, nextZ],
    [nextX + 1, nextY + 1, nextZ]
  ] as const
  if (nextZ < maxZ) {
    for (const child of children) {
      for (const coord of traverseChildren(...child, maxZ, result)) {
        yield coord
      }
    }
  } else {
    for (const child of children) {
      yield (result ?? new TileCoordinate()).set(...child)
    }
  }
}

export class TileCoordinate {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0
  ) {}

  set(x: number, y: number, z?: number): this {
    this.x = x
    this.y = y
    if (z != null) {
      this.z = z
    }
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

  getParent(result = new TileCoordinate()): TileCoordinate {
    const divisor = 2 ** this.z
    const x = this.x / divisor
    const y = this.y / divisor
    const z = this.z - 1
    const scale = 2 ** z
    return result.set(Math.floor(x * scale), Math.floor(y * scale), z)
  }

  *traverseChildren(
    depth: number,
    result?: TileCoordinate
  ): Generator<TileCoordinate> {
    const { x, y, z } = this
    for (const coord of traverseChildren(x, y, z, z + depth, result)) {
      yield coord
    }
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
