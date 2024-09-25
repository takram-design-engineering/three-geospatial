export interface Plugin {}

export interface TilesFadePluginOptions {
  maximumFadeOutTiles?: number
  fadeRootTiles?: boolean
  fadeDuration?: number
}

export declare class TilesFadePlugin implements Plugin {
  tiles: TilesRenderer | null
  fadeDuration: number
  readonly fadingTiles: number

  constructor(options?: TilesFadePluginOptions)
  init(tiles: TilesRenderer): void
  dispose(): void
}

export declare class UpdateOnChangePlugin implements Plugin {
  tiles: TilesRenderer | null
  needsUpdate: boolean
  cameraMatrices: Map<Camera, Matrix4>

  init(tiles: TilesRenderer): void
  dispose(): void
}

export interface TileCompressionPluginOptions {
  // Whether to generate normals if they don't already exist.
  generateNormals?: boolean

  // Whether to disable use of mipmaps since they are typically not necessary
  // with something like 3d tiles.
  disableMipmaps?: boolean

  // Whether to compress certain attributes.
  compressIndex?: boolean
  compressNormals?: boolean
  compressUvs?: boolean
  compressPosition?: boolean

  // The TypedArray type to use when compressing the attributes.
  uvType?: TypedArrayConstructor
  normalType?: TypedArrayConstructor
  positionType?: TypedArrayConstructor
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export declare class TileCompressionPlugin implements Plugin {
  constructor(options?: TileCompressionPluginOptions)
}
