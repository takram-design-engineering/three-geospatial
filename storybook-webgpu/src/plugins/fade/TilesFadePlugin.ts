import { TilesFadePlugin as TilesFadePluginBase } from '3d-tiles-renderer/plugins'

import { FadeMaterialManager } from './FadeMaterialManager'

export class TilesFadePlugin extends TilesFadePluginBase {
  declare protected _fadeMaterialManager: unknown

  constructor(...args: ConstructorParameters<typeof TilesFadePluginBase>) {
    super(...args)
    this._fadeMaterialManager = new FadeMaterialManager()
  }
}
