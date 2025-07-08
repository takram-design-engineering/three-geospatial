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

  get mainCamera(): Camera {
    return this._mainCamera
  }

  set mainCamera(value: Camera) {
    this._mainCamera = value
  }
}
