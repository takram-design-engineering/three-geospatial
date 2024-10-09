import {
  GooglePhotorealisticTilesRenderer as GooglePhotorealisticTilesRendererBase,
  type Tile
} from '3d-tiles-renderer'

export const TILE_PREPROCESS_PROMISE = Symbol('TILE_PREPROCESS_PROMISE')

declare module '3d-tiles-renderer' {
  interface Tile {
    [TILE_PREPROCESS_PROMISE]?: Promise<void>
  }

  interface GooglePhotorealisticTilesRenderer {
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    setTileVisible(tile: Tile, state: boolean): void
  }
}

export class GooglePhotorealisticTilesRenderer extends GooglePhotorealisticTilesRendererBase {
  override setTileVisible(tile: Tile, state: boolean): void {
    if (tile[TILE_PREPROCESS_PROMISE] != null) {
      tile[TILE_PREPROCESS_PROMISE].then(() => {
        super.setTileVisible(tile, state)
      }).catch(error => {
        console.error(error)
      })
    } else {
      super.setTileVisible(tile, state)
    }
  }
}
