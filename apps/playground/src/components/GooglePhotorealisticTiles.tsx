import { useFrame, useThree } from '@react-three/fiber'
import { GoogleCloudAuthPlugin, TilesRenderer } from '3d-tiles-renderer'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import { TileCompressionPlugin, UpdateOnChangePlugin } from '@geovanni/3d-tiles'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

function createTiles(apiKey: string): TilesRenderer {
  // @ts-expect-error Missing type
  const tiles = new TilesRenderer()
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
  apiKey: string
}

export const GooglePhotorealisticTiles = forwardRef<
  TilesRenderer,
  GooglePhotorealisticTilesProps
>(function GooglePhotorealisticTiles({ apiKey }, forwardedRef) {
  const [tiles, setTiles] = useState(() => createTiles(apiKey))

  useEffect(() => {
    setTiles(createTiles(apiKey))
  }, [apiKey])

  useEffect(() => {
    return () => {
      tiles.dispose()
    }
  }, [tiles])

  const { gl, camera } = useThree()

  useEffect(() => {
    tiles.setCamera(camera)
  }, [tiles, camera])

  useEffect(() => {
    tiles.setResolutionFromRenderer(camera, gl)
  }, [tiles, camera, gl])

  useFrame(() => {
    tiles.update()
  })

  useImperativeHandle(forwardedRef, () => tiles, [tiles])

  return <primitive object={tiles.group} />
})
