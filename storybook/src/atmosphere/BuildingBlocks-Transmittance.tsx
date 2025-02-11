import { Canvas, useLoader } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'

import { DataTextureViewer } from './helpers/DataTextureViewer'

const Story: StoryFn = () => {
  const textures = useLoader(PrecomputedTexturesLoader, 'atmosphere')
  return (
    <Canvas>
      <DataTextureViewer texture={textures.transmittanceTexture} zoom={2} />
    </Canvas>
  )
}

export default Story
