import { Canvas } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'

import { CloudShape } from '@takram/three-clouds'

import { Procedural3DTextureViewer } from './helpers/Procedural3DTextureViewer'

const Story: StoryFn = () => (
  <Canvas>
    <Procedural3DTextureViewer
      createProceduralTexture={() => new CloudShape()}
      fileName='shape.bin'
    />
  </Canvas>
)

export default Story
