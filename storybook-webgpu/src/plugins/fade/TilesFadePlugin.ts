import { TilesFadePlugin as TilesFadePluginBase } from '3d-tiles-renderer/plugins'

import { FadeMaterialManager } from './FadeMaterialManager'

declare module '3d-tiles-renderer/plugins' {
  interface TilesFadePlugin {
    _fadeMaterialManager: unknown
  }
}

export class TilesFadePlugin extends TilesFadePluginBase {
  constructor(...args: ConstructorParameters<typeof TilesFadePluginBase>) {
    super(...args)
    this._fadeMaterialManager = new FadeMaterialManager()
  }
}
