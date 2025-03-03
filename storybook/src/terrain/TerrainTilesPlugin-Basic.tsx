/// <reference types="vite/types/importMeta.d.ts" />

import { Canvas, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import {
  CesiumIonAuthPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { useLayoutEffect, type FC } from 'react'
import { MeshNormalMaterial } from 'three'

import { TerrainTilesPlugin } from '@takram/three-3d-tiles-support'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'

const longitude = 138.5973
const latitude = 35.2138
const heading = 71
const pitch = -31
const distance = 7000

const Globe: FC = () => {
  const camera = useThree(({ camera }) => camera)
  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [camera])

  return (
    <TilesRenderer>
      <TilesPlugin
        plugin={CesiumIonAuthPlugin}
        args={{
          apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
          assetId: 1,
          autoRefreshToken: true
        }}
      />
      <TilesPlugin
        plugin={TerrainTilesPlugin}
        args={{ material: new MeshNormalMaterial() }}
      />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <GlobeControls enableDamping />
    </TilesRenderer>
  )
}

const Story: StoryFn = () => {
  return (
    <Canvas>
      <Globe />
    </Canvas>
  )
}

export default Story
