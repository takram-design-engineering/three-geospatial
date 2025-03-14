import { Canvas, useLoader } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'

import { DataTextureViewer } from './helpers/DataTextureViewer'

const Story: StoryFn = () => {
  const textures = useLoader(
    PrecomputedTexturesLoader,
    'atmosphere',
    loader => {
      loader.format = 'binary'
    }
  )
  return (
    <Canvas>
      <DataTextureViewer
        texture={textures.irradianceTexture}
        fileName='irradiance.exr'
        zoom={4}
        valueScale={100}
      />
    </Canvas>
  )
}

export default Story
