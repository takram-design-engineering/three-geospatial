import { XYZTilesOverlay } from '3d-tiles-renderer/three/plugins'

import { WaterAreaImageSource } from './WaterAreaImageSource'

export class WaterAreaTilesOverlay extends XYZTilesOverlay {
  constructor(options = {}) {
    super({
      ...options,
      url: '' // Required but not used
    })
    this.imageSource = new WaterAreaImageSource(options)
  }
}
