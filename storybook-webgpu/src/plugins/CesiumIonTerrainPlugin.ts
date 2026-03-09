import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { QuantizedMeshPlugin } from '3d-tiles-renderer/plugins'

type CesiumIonAuthPluginOptions = ConstructorParameters<
  typeof CesiumIonAuthPlugin
>[0]
type QuantizedMeshPluginOptions = ConstructorParameters<
  typeof QuantizedMeshPlugin
>[0]

export interface CesiumIonTerrainPluginOptions extends CesiumIonAuthPluginOptions {
  assetOptions?: {
    quantizedMesh?: QuantizedMeshPluginOptions
  }
}

export class CesiumIonTerrainPlugin extends CesiumIonAuthPlugin {
  constructor({ assetOptions, ...options }: CesiumIonTerrainPluginOptions) {
    super({
      assetTypeHandler: (type, tiles, asset) => {
        if (
          type === 'TERRAIN' &&
          tiles.getPluginByName('QUANTIZED_MESH_PLUGIN') === null
        ) {
          tiles.registerPlugin(
            new QuantizedMeshPlugin(assetOptions?.quantizedMesh ?? {})
          )
        } else {
          console.warn(
            `CesiumIonAuthPlugin: Cesium Ion asset type "${type}" unhandled.`
          )
        }
      },
      ...options
    })
  }
}
