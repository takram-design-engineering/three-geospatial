import { useFrame, useThree } from '@react-three/fiber'
import {
  GoogleCloudAuthPlugin,
  GooglePhotorealisticTilesRenderer,
  type TilesRenderer
} from '3d-tiles-renderer'
import { useEffect, useState, type FC } from 'react'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

function createTiles(): TilesRenderer {
  const tiles = new GooglePhotorealisticTilesRenderer()
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: '' }))

  const loader = new GLTFLoader(tiles.manager)
  loader.setDRACOLoader(dracoLoader)
  tiles.manager.addHandler(/\.gltf$/, loader)

  return tiles
}

export interface GooglePhotorealisticTilesProps {}

export const GooglePhotorealisticTiles: FC<
  GooglePhotorealisticTilesProps
> = () => {
  const [tiles, setTiles] = useState(() => createTiles())

  useEffect(() => {
    setTiles(createTiles())
  }, [])

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
