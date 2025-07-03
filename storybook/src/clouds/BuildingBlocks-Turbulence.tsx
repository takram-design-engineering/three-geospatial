import { Canvas } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'

import { Turbulence } from '@takram/three-clouds'

import { ProceduralTextureViewer } from './helpers/ProceduralTextureViewer'

const Story: StoryFn = () => (
  <Canvas>
    <ProceduralTextureViewer
      createProceduralTexture={() => new Turbulence()}
      fileName='turbulence.png'
    />
  </Canvas>
)

export default Story
