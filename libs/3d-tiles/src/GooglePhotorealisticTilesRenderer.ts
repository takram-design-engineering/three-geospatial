import {
  GooglePhotorealisticTilesRenderer as GooglePhotorealisticTilesRendererBase,
  type Tile
} from '3d-tiles-renderer'
import { Promise as WorkerPromise } from 'workerpool'

export const TILE_ASYNC_STATE = Symbol('TILE_ASYNC_STATE')

export interface TileAsyncState {
  promise: WorkerPromise<unknown>
  canceled?: boolean
}

declare module '3d-tiles-renderer' {
  interface Tile {
    [TILE_ASYNC_STATE]?: TileAsyncState
  }

  interface GooglePhotorealisticTilesRenderer {
    // eslint-disable-next-line @typescript-eslint/method-signature-style
    setTileVisible(tile: Tile, state: boolean): void
  }
}

export class GooglePhotorealisticTilesRenderer extends GooglePhotorealisticTilesRendererBase {
  override setTileVisible(tile: Tile, value: boolean): void {
    // TODO: Sync with tiles being faded out by TilesFadePlugin.
    const state = tile[TILE_ASYNC_STATE]
    if (state != null && state.canceled !== true) {
      // We can't use WorkerPromise.cancel() because we'll transfer buffers
      // attached to WebGL context. Just let the workers finish and ignore.
      if (!value) {
        state.canceled = true
        super.setTileVisible(tile, value)
      } else {
        state.promise
          .then(() => {
            if (state.canceled !== true) {
              super.setTileVisible(tile, value)
            }
          })
          .catch(error => {
            if (!(error instanceof WorkerPromise.CancellationError)) {
              console.error(error)
            }
          })
      }
    } else {
      super.setTileVisible(tile, value)
    }
  }
}
