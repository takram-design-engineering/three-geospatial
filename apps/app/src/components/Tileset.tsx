import { useFrame, useThree } from '@react-three/fiber'
import { GLTFCesiumRTCExtension, TilesRenderer } from '3d-tiles-renderer'
import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { Mesh, MeshStandardMaterial, type Group } from 'three'
import { GLTFLoader, type GLTFLoaderPlugin } from 'three-stdlib'

import { assertType } from '@geovanni/type-helpers'

const gltfLoader = new GLTFLoader()
gltfLoader.register(() => new GLTFCesiumRTCExtension() as GLTFLoaderPlugin)

const material = new MeshStandardMaterial({
  metalness: 0.5
})

export interface TilesetProps {
  url: string
}

export const Tileset: FC<TilesetProps> = ({ url }) => {
  const createTiles = useCallback((url: string) => {
    const tiles = new TilesRenderer(url)
    tiles.manager.addHandler(/\.gltf$/, gltfLoader)

    tiles.addEventListener('load-model', event => {
      assertType<{
        type: 'load-model'
        scene: Group
      }>(event)

      event.scene.traverse(object => {
        object.castShadow = true
        object.receiveShadow = true
        if (object instanceof Mesh) {
          object.material = material
        }
      })
    })

    return tiles
  }, [])

  const [tiles, setTiles] = useState(() => createTiles(url))

  const urlRef = useRef(url)
  useEffect(() => {
    if (url !== urlRef.current) {
      urlRef.current = url
      setTiles(createTiles(url))
    }
  }, [url, createTiles])

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
