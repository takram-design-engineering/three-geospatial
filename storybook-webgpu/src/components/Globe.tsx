import { extend, type ThreeElement } from '@react-three/fiber'
import type { TilesRenderer as TilesRendererImpl } from '3d-tiles-renderer'
import {
  CesiumIonAuthPlugin,
  GoogleCloudAuthPlugin
} from '3d-tiles-renderer/core/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import {
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/three/plugins'
import { useEffect, useState, type FC, type ReactNode, type Ref } from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Material } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { BundleGroup } from 'three/webgpu'

import { radians } from '@takram/three-geospatial'

import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'
import { UpdateOnChangeBundlePlugin } from '../plugins/UpdateOnChangeBundlePlugin'
import { connectToDescription } from './Description'

declare module '@react-three/fiber' {
  interface ThreeElements {
    bundleGroup: ThreeElement<typeof BundleGroup>
  }
}

extend({ BundleGroup })

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const GIGABYTE_BYTES = 2 ** 30

export interface GlobeProps {
  ref?: Ref<TilesRendererImpl>
  apiKey?: string
  materialHandler?: () => Material
  useBundleGroup?: boolean
  useHighQualitySettings?: boolean
  children?: ReactNode
}

export const Globe: FC<GlobeProps> = ({
  ref,
  apiKey = import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
  materialHandler,
  useBundleGroup = true,
  useHighQualitySettings = false,
  children
}) => {
  const [tiles, setTiles] = useState<TilesRendererImpl | null>(null)
  useEffect(() => {
    if (tiles == null) {
      return
    }
    if (useHighQualitySettings) {
      tiles.errorTarget = 8
      tiles.lruCache.maxSize = 24000
      tiles.lruCache.maxBytesSize = 1.6 * GIGABYTE_BYTES
    } else {
      // TilesRenderer's default settings with useRecommendedSettings enabled:
      tiles.errorTarget = 20
      tiles.lruCache.maxSize = 8000
      tiles.lruCache.maxBytesSize = 0.4 * GIGABYTE_BYTES
    }
  }, [tiles, useHighQualitySettings])

  const [bundleGroup, setBundleGroup] = useState<BundleGroup | null>(null)

  const content = (
    <TilesRenderer
      ref={mergeRefs([ref, setTiles, connectToDescription])}
      // Reconstruct tiles when API key changes.
      key={apiKey}
    >
      {(import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY ?? apiKey ?? '') !== '' ? (
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{
            apiToken: apiKey,
            autoRefreshToken: true,
            useRecommendedSettings: !useHighQualitySettings
          }}
        />
      ) : (
        <TilesPlugin
          plugin={CesiumIonAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
            assetId: '2275207', // Google Photorealistic Tiles
            autoRefreshToken: true,
            useRecommendedSettings: !useHighQualitySettings
          }}
        />
      )}
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} bundleGroup={bundleGroup} />
      <TilesPlugin
        plugin={UpdateOnChangeBundlePlugin}
        bundleGroup={bundleGroup}
      />
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

  return useBundleGroup ? (
    <bundleGroup ref={setBundleGroup}>{content}</bundleGroup>
  ) : (
    content
  )
}
