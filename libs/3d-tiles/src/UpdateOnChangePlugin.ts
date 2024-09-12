// See: https://github.com/NASA-AMMOS/3DTilesRendererJS/tree/master/example/src/plugins

import { type TilesRenderer } from '3d-tiles-renderer'
import { Matrix4, type Camera } from 'three'

const matrixScratch = new Matrix4()

export class UpdateOnChangePlugin {
  tiles?: TilesRenderer

  private needsUpdate = false
  private readonly cameraMatrices = new Map<Camera, Matrix4>()

  // Register callbacks to add cameras and force a new update.
  private readonly needsUpdateCallback = (): void => {
    this.needsUpdate = true
  }

  private readonly onCameraAdd = ({ camera }: { camera?: Camera }): void => {
    this.needsUpdate = true
    if (camera != null) {
      this.cameraMatrices.set(camera, new Matrix4())
    }
  }

  private readonly onCameraDelete = ({ camera }: { camera?: Camera }): void => {
    this.needsUpdate = true
    if (camera != null) {
      this.cameraMatrices.delete(camera)
    }
  }

  init(tiles: TilesRenderer): void {
    this.tiles = tiles

    // Dispose tile is included here because the LRUCache can evict tiles that
    // are actively used if they're above the byte cap causing tile gaps.
    tiles.addEventListener('dispose-model', this.needsUpdateCallback)
    tiles.addEventListener('camera-resolution-change', this.needsUpdateCallback)
    tiles.addEventListener('load-content', this.needsUpdateCallback)
    tiles.addEventListener('add-camera', this.onCameraAdd)
    tiles.addEventListener('delete-camera', this.onCameraDelete)
  }

  doTilesNeedUpdate(): boolean {
    const tiles = this.tiles
    if (tiles == null) {
      return false
    }

    let didCamerasChange = false
    this.cameraMatrices.forEach((matrix, camera) => {
      // Check if the camera position or frustum changed by comparing the MVP
      // matrix between frames.
      matrixScratch
        .copy(tiles.group.matrixWorld)
        .premultiply(camera.matrixWorldInverse)
        .premultiply(camera.projectionMatrixInverse)

      didCamerasChange = didCamerasChange || !matrixScratch.equals(matrix)
      matrix.copy(matrixScratch)
    })

    const needsUpdate = this.needsUpdate
    this.needsUpdate = false

    return needsUpdate || didCamerasChange
  }

  dispose(): void {
    const tiles = this.tiles
    if (tiles == null) {
      return
    }
    tiles.removeEventListener('dispose-model', this.needsUpdateCallback)
    tiles.removeEventListener(
      'camera-resolution-change',
      this.needsUpdateCallback
    )
    tiles.removeEventListener('content-load', this.needsUpdateCallback)
    tiles.removeEventListener('camera-add', this.onCameraAdd)
    tiles.removeEventListener('camera-delete', this.onCameraDelete)
  }
}
