import { Pass } from 'postprocessing'
import { Camera } from 'three'

import type { CascadedShadowMaps } from './CascadedShadowMaps'

export interface PassBaseOptions {
  shadow: CascadedShadowMaps
}

export abstract class PassBase extends Pass {
  shadow: CascadedShadowMaps

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
