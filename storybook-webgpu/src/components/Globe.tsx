import type { TilesRenderer as TilesRendererImpl } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import type { FC, ReactNode, Ref } from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Material } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

import { radians } from '@takram/three-geospatial'

import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'
import { connectToDescription } from './Description'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

export interface GlobeProps {
  ref?: Ref<TilesRendererImpl>
  apiKey?: string
  materialHandler?: () => Material
  children?: ReactNode
}

export const Globe: FC<GlobeProps> = ({
  ref,
  apiKey = import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
  materialHandler,
  children
}) => {
  return (
    <TilesRenderer
      ref={mergeRefs([ref, connectToDescription])}
      // Reconstruct tiles when API key changes.
      key={apiKey}
    >
      {(import.meta.env.STORYBOOK_ION_API_TOKEN ?? '') !== '' ? (
        <TilesPlugin
          plugin={CesiumIonAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
            assetId: '2275207', // Google Photorealistic Tiles
            autoRefreshToken: true
          }}
        />
      ) : (
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{
            apiToken: apiKey,
            autoRefreshToken: true
          }}
        />
      )}
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin
        plugin={TileCreasedNormalsPlugin}
        args={{ creaseAngle: radians(30) }}
      />
      <TilesPlugin
        plugin={TileMaterialReplacementPlugin}
        args={materialHandler}
      />
      <TilesPlugin plugin={TilesFadePlugin} />
      {children}
    </TilesRenderer>
  )
}
