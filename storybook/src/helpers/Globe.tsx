import type { TilesRenderer as TilesRendererImpl } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  TilesAttributionOverlay,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState, type FC, type ReactNode, type Ref } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

import { radians } from '@takram/three-geospatial'

import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'
import {
  cesiumIonTokenAtom,
  googleMapsApiKeyAtom,
  needsApiKeyAtom
} from './states'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

export interface GlobeProps {
  ref?: Ref<TilesRendererImpl>
  children?: ReactNode
}
export const Globe: FC<GlobeProps> = ({ ref, children }) => {
  const cesiumIonToken = useAtomValue(cesiumIonTokenAtom) || import.meta.env.STORYBOOK_CESIUM_ION_TOKEN || ''
  const googleMapsApiKey = useAtomValue(googleMapsApiKeyAtom) || import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY || ''
  const assetId = import.meta.env.STORYBOOK_CESIUM_ION_ASSET_ID ?? '2275207'
  const useCesiumIon = cesiumIonToken !== '' || googleMapsApiKey === ''
  const apiToken = useCesiumIon ? cesiumIonToken : googleMapsApiKey
  const url = useCesiumIon
    ? undefined
    : `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiToken}`

  const [tiles, setTiles] = useState<TilesRendererImpl | null>(null)
  const setNeedsApiKey = useSetAtom(needsApiKeyAtom)
  useEffect(() => {
    if (tiles == null) {
      return
    }
    const callback = (): void => {
      setNeedsApiKey(true)
    }
    tiles.addEventListener('load-error', callback)
    return () => {
      tiles.removeEventListener('load-error', callback)
    }
  }, [tiles, setNeedsApiKey])

  return (
    <TilesRenderer
      ref={mergeRefs([ref, setTiles])}
      // Reconstruct tiles when credentials change.
      key={`${useCesiumIon ? 'cesium-ion' : 'google'}:${apiToken}:${assetId}`}
      url={url}
    >
      <TilesPlugin
        plugin={useCesiumIon ? CesiumIonAuthPlugin : GoogleCloudAuthPlugin}
        args={
          useCesiumIon
            ? { apiToken, assetId, autoRefreshToken: true }
            : { apiToken, autoRefreshToken: true }
        }
      />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin
        plugin={TileCreasedNormalsPlugin}
        args={{ creaseAngle: radians(30) }}
      />
      {children}
      <TilesAttributionOverlay />
    </TilesRenderer>
  )
}
