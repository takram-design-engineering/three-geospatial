// cSpell:words minzoom maxzoom
import {
  PriorityQueue,
  type Tile,
  type TileBase,
  type Tileset,
  type TilesRendererBase
} from '3d-tiles-renderer'
import stringTemplate from 'string-template'
import { Mesh, MeshStandardMaterial, type Material } from 'three'
import invariant from 'tiny-invariant'
import { type PartialDeep } from 'type-fest'

import {
  fromBufferGeometryLike,
  radians,
  Rectangle,
  TileCoordinate,
  TilingScheme
} from '@takram/three-geospatial'
import { queueTask } from '@takram/three-geospatial-worker'
import { type TerrainLayer } from '@takram/three-terrain'

const TILE_X = /*#__PURE__*/ Symbol('TILE_X')
const TILE_Y = /*#__PURE__*/ Symbol('TILE_Y')
const TILE_Z = /*#__PURE__*/ Symbol('TILE_Z')

// TODO: Consolidate types
declare module '3d-tiles-renderer' {
  interface TileBase {
    [TILE_X]?: number
    [TILE_Y]?: number
    [TILE_Z]?: number
  }

  interface Plugin {
    preprocessURL?: (url: string | URL, tile?: Tile | null) => string
    fetchData?: (url: string | URL, options?: unknown) => Promise<Response>
  }

  interface TilesRendererBase {
    rootURL?: string | null
    invokeAllPlugins: (callback: (plugin: Plugin) => string | URL) => void
    invokeOnePlugin: (
      callback: (plugin: Plugin) => Promise<Response | null | undefined>
    ) => Promise<Response | null | undefined>
    preprocessTileSet: (tileset: PartialDeep<Tileset>, url: string) => void
  }
}

const coordinateScratch = /*#__PURE__*/ new TileCoordinate()
const rectangleScratch = /*#__PURE__*/ new Rectangle()

export interface TerrainTilesPluginOptions {
  material?: Material
  rootGeometricError?: number
  estimatedMinHeight?: number
  estimatedMaxHeight?: number
}

export class TerrainTilesPlugin {
  material: Material
  rootGeometricError: number
  estimatedMinHeight: number
  estimatedMaxHeight: number

  tiles: TilesRendererBase | null = null
  processQueue: PriorityQueue | null = null

  private url?: string
  private layer?: TerrainLayer
  private tilingScheme?: TilingScheme
  private tilesNeedUpdate = false

  constructor({
    material = new MeshStandardMaterial(),
    rootGeometricError = 1e5,
    estimatedMinHeight = 0,
    estimatedMaxHeight = 4e3
  }: TerrainTilesPluginOptions = {}) {
    this.material = material
    this.rootGeometricError = rootGeometricError
    this.estimatedMinHeight = estimatedMinHeight
    this.estimatedMaxHeight = estimatedMaxHeight
  }

  get minLevel(): number {
    return this.layer?.minzoom ?? 0
  }

  get maxLevel(): number {
    return this.layer?.maxzoom ?? 0
  }

  // Plugin method
  init(tiles: TilesRendererBase): void {
    this.tiles = tiles

    const processQueue = new PriorityQueue()
    processQueue.priorityCallback = tiles.downloadQueue.priorityCallback
    processQueue.maxJobs = 20
    this.processQueue = processQueue
  }

  private getUrl(x: number, y: number, z: number): string {
    invariant(this.url != null)
    invariant(this.layer != null)
    return new URL(
      stringTemplate(this.layer.tiles[0], {
        x,
        y,
        z,
        version: this.layer.version
      }),
      this.url
    ).toString()
  }

  private isAvailable(x: number, y: number, z: number): boolean {
    return (
      this.layer?.available[z]?.some(
        rect =>
          rect.startX <= x &&
          x <= rect.endX &&
          rect.startY <= y &&
          y <= rect.endY
      ) === true
    )
  }

  private createTile(x: number, y: number, z: number): TileBase {
    invariant(this.tilingScheme != null)
    const rectangle = this.tilingScheme.getRectangle(
      coordinateScratch.set(x, y, z),
      rectangleScratch
    )
    const { west, north, east, south } = rectangle
    return {
      refine: 'REPLACE',
      geometricError: this.rootGeometricError / Math.pow(2, z),
      boundingVolume: {
        // @ts-expect-error Missing type
        region: [
          west,
          south,
          east,
          north,
          this.estimatedMinHeight,
          this.estimatedMaxHeight
        ]
      },
      content: {
        uri: this.getUrl(x, y, z)
      },
      children: [],
      [TILE_X]: x,
      [TILE_Y]: y,
      [TILE_Z]: z
    }
  }

  private readonly processCallback = async (tile: Tile): Promise<void> => {
    const x = tile[TILE_X]
    const y = tile[TILE_Y]
    const z = tile[TILE_Z]
    if (x == null || y == null || z == null) {
      return
    }
    for (let offsetY = 0; offsetY < 2; ++offsetY) {
      for (let offsetX = 0; offsetX < 2; ++offsetX) {
        const childX = 2 * x + offsetX
        const childY = 2 * y + offsetY
        const childZ = z + 1
        if (this.isAvailable(childX, childY, childZ)) {
          tile.children?.push(this.createTile(childX, childY, childZ))
        }
      }
    }
    this.tilesNeedUpdate = true
  }

  // Plugin method
  doTilesNeedUpdate(): boolean | null {
    if (this.tilesNeedUpdate) {
      this.tilesNeedUpdate = false
      return true
    }
    return null
  }

  // Plugin method
  async preprocessNode(
    tile: Tile,
    baseUrl: string,
    parentTile: Tile | null
  ): Promise<void> {
    const z = tile[TILE_Z]
    invariant(z != null)
    invariant(this.processQueue != null)
    if (z < this.maxLevel) {
      await this.processQueue.add(tile, this.processCallback)
    }
  }

  // Plugin method
  async parseToMesh(
    buffer: ArrayBuffer,
    tile: Tile,
    extension: unknown,
    uri: string,
    abortSignal: AbortSignal
  ): Promise<Mesh> {
    const x = tile[TILE_X]
    const y = tile[TILE_Y]
    const z = tile[TILE_Z]
    invariant(x != null && y != null && z != null)
    invariant(this.tilingScheme != null)

    const result = await queueTask('createTerrainGeometry', [
      buffer,
      this.tilingScheme,
      { x, y, z },
      true // computeVertexNormals
    ])

    // @ts-expect-error Missing type
    tile.boundingVolume.region[4] = result.header.minHeight
    // @ts-expect-error Missing type
    tile.boundingVolume.region[5] = result.header.maxHeight

    const geometry = fromBufferGeometryLike(result.geometry)
    const mesh = new Mesh(geometry, this.material)
    mesh.position.copy(result.position)
    return mesh
  }

  // Plugin method
  async loadRootTileSet(): Promise<Tileset | null | undefined> {
    const { tiles } = this
    if (tiles?.rootURL == null) {
      return
    }

    let layerUrl: string = tiles.rootURL
    tiles.invokeAllPlugins(
      plugin =>
        (layerUrl =
          plugin.preprocessURL != null
            ? plugin.preprocessURL(layerUrl)
            : layerUrl)
    )
    layerUrl = new URL('layer.json', layerUrl).toString()

    const layer: TerrainLayer | undefined = await tiles
      .invokeOnePlugin(async plugin =>
        plugin.fetchData != null ? await plugin.fetchData(layerUrl) : undefined
      )
      .then(async response => await response?.json())
    if (layer == null) {
      return
    }
    if (layer.format !== 'quantized-mesh-1.0') {
      throw new Error(`Format must be "quantized-mesh-1.0": ${layer.format}`)
    }
    if (layer.scheme !== 'tms') {
      throw new Error(`Scheme must be "tms": ${layer.scheme}`)
    }
    switch (layer.projection) {
      case 'EPSG:4326':
        this.tilingScheme = new TilingScheme(2, 1)
        break
      case 'EPSG:3857':
        this.tilingScheme = new TilingScheme(1, 1)
        break
      default:
        throw new Error(`Unknown projection: ${layer.projection}`)
    }
    this.url = tiles.rootURL
    this.layer = layer

    const [west, south, east, north] = layer.bounds
    const boundingVolume: TileBase['boundingVolume'] = {
      // @ts-expect-error Missing type
      region: [
        radians(west),
        radians(south),
        radians(east),
        radians(north),
        this.estimatedMinHeight,
        this.estimatedMaxHeight
      ]
    }

    const children: TileBase[] = []
    const rects = layer.available[0]
    for (const rect of rects) {
      for (let y = rect.startY; y <= rect.endY; ++y) {
        for (let x = rect.startX; x <= rect.endX; ++x) {
          children.push(this.createTile(x, y, layer.minzoom))
        }
      }
    }

    const tileset = {
      asset: {
        version: '1.1'
      },
      geometricError: this.rootGeometricError,
      root: {
        refine: 'REPLACE',
        geometricError: this.rootGeometricError,
        boundingVolume,
        children,
        [TILE_Z]: 0
      }
    } satisfies PartialDeep<Tileset>
    tiles.preprocessTileSet(tileset, layerUrl)

    return tileset as Tileset
  }
}
