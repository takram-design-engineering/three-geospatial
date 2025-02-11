import { Canvas, useLoader } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'

import { PrecomputedTexturesLoader } from '@takram/three-atmosphere'

import { Data3DTextureViewer } from './helpers/Data3DTextureViewer'

const Story: StoryFn = () => {
  const textures = useLoader(PrecomputedTexturesLoader, 'atmosphere')
  return (
    <Canvas>
      <Data3DTextureViewer
        texture={textures.scatteringTexture}
        valueScale={0.5}
      />
    </Canvas>
  )
}

export default Story
