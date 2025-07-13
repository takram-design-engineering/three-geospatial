import { Pass } from 'postprocessing'
import { Camera } from 'three'

import type { CascadedShadow } from '@takram/three-geospatial'

export interface PassBaseOptions {
  shadow: CascadedShadow
}

export abstract class PassBase extends Pass {
  shadow: CascadedShadow

  private _mainCamera = new Camera()

  constructor(name: string, options: PassBaseOptions) {
    super(name)
    const { shadow } = options
    this.shadow = shadow
  }

  override get mainCamera(): Camera {
    return this._mainCamera
  }

  override set mainCamera(value: Camera) {
    this._mainCamera = value
  }
}
