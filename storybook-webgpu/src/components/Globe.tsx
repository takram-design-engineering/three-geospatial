import type { TilesRenderer as TilesRendererImpl } from '3d-tiles-renderer'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import type { FC, ReactNode, Ref } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshBasicNodeMaterial, type NodeMaterial } from 'three/webgpu'

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
  overrideMaterial?: typeof NodeMaterial
  children?: ReactNode
}

export const Globe: FC<GlobeProps> = ({
  ref,
  apiKey = import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
  overrideMaterial = MeshBasicNodeMaterial,
  children
}) => (
  <TilesRenderer
    ref={mergeRefs([ref, connectToDescription])}
    // Reconstruct tiles when API key changes.
    key={apiKey}
    // The root URL sometimes becomes null without specifying the URL.
    url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`}
  >
    <TilesPlugin
      plugin={GoogleCloudAuthPlugin}
      args={{
        apiToken: apiKey,
        autoRefreshToken: true
      }}
    />
    <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
    <TilesPlugin plugin={TileCompressionPlugin} />
    <TilesPlugin plugin={UpdateOnChangePlugin} />
    <TilesPlugin
      plugin={TileCreasedNormalsPlugin}
      args={{ creaseAngle: radians(30) }}
    />
    <TilesPlugin
      plugin={TileMaterialReplacementPlugin}
      args={[overrideMaterial]}
    />
    <TilesPlugin plugin={TilesFadePlugin} />
    {children}
  </TilesRenderer>
)
