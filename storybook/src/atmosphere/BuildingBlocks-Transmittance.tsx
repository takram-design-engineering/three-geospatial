import { Canvas, useLoader } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react-vite'
import { Suspense, type FC } from 'react'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'

import { DataTextureViewer } from './helpers/DataTextureViewer'

const Content: FC = () => {
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
        texture={textures.transmittanceTexture}
        fileName='transmittance.exr'
        zoom={2}
      />
    </Canvas>
  )
}

const Story: StoryFn = () => (
  <Suspense>
    <Content />
  </Suspense>
)

export default Story
