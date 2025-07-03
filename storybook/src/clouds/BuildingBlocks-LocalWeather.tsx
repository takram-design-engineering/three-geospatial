import { Canvas } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'

import { LocalWeather } from '@takram/three-clouds'

import { ProceduralTextureViewer } from './helpers/ProceduralTextureViewer'

const Story: StoryFn = () => (
  <Canvas>
    <ProceduralTextureViewer
      createProceduralTexture={() => new LocalWeather()}
      fileName='local_weather.png'
    />
  </Canvas>
)

export default Story
