import { useFrame, useThree } from '@react-three/fiber'
import {
  GoogleCloudAuthPlugin,
  GooglePhotorealisticTilesRenderer,
  type TilesRenderer
} from '3d-tiles-renderer'
import { useEffect, useState, type FC } from 'react'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import { TileCompressionPlugin, UpdateOnChangePlugin } from '@geovanni/3d-tiles'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

function createTiles(apiKey?: string): TilesRenderer {
  const tiles = new GooglePhotorealisticTilesRenderer()
  if (apiKey != null) {
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: apiKey
      })
    )
  }
  tiles.registerPlugin(new UpdateOnChangePlugin())
  tiles.registerPlugin(new TileCompressionPlugin())

  const loader = new GLTFLoader(tiles.manager)
  loader.setDRACOLoader(dracoLoader)
  tiles.manager.addHandler(/\.gltf$/, loader)

  return tiles
}

export interface GooglePhotorealisticTilesProps {
  apiKey?: string
}

export const GooglePhotorealisticTiles: FC<GooglePhotorealisticTilesProps> = ({
  apiKey
}) => {
  const [tiles, setTiles] = useState(() => createTiles(apiKey))

  useEffect(() => {
    setTiles(createTiles(apiKey))
  }, [apiKey])

  useEffect(() => {
    return () => {
      tiles.dispose()
    }
  }, [tiles])

  const camera = useThree(({ camera }) => camera)
  const gl = useThree(({ gl }) => gl)

  useEffect(() => {
    tiles.setCamera(camera)
  }, [tiles, camera])

  useEffect(() => {
    tiles.setResolutionFromRenderer(camera, gl)
  }, [tiles, camera, gl])

  useFrame(() => {
    tiles.update()
  })

  return <primitive object={tiles.group} />
}
