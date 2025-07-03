import { Canvas, useLoader, useThree } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'
import { useEffect, useMemo, type FC } from 'react'

import {
  PrecomputedTexturesGenerator,
  PrecomputedTexturesLoader
} from '@takram/three-atmosphere'

import { useControls } from '../helpers/useControls'
import { DataTextureViewer } from './helpers/DataTextureViewer'

const binaryLoader = new PrecomputedTexturesLoader({ format: 'binary' })
const exrLoader = new PrecomputedTexturesLoader({ format: 'exr' })

const Content: FC = () => {
  const { source } = useControls({
    source: {
      options: ['generator', 'binary', 'exr'] as const
    }
  })

  const renderer = useThree(({ gl }) => gl)
  const generator = useMemo(
    () => new PrecomputedTexturesGenerator(renderer),
    [renderer]
  )
  useEffect(() => {
    void generator.update()
    return () => {
      generator.dispose()
    }
  }, [generator])

  binaryLoader.setType(renderer)
  exrLoader.setType(renderer)
  const textures = useLoader(
    source === 'binary' ? binaryLoader : exrLoader,
    'atmosphere'
  )

  return (
    <DataTextureViewer
      texture={
        source === 'generator'
          ? generator.textures.transmittanceTexture
          : textures.transmittanceTexture
      }
      name='transmittance'
      zoom={2}
    />
  )
}

const Story: StoryFn = () => (
  <Canvas>
    <Content />
  </Canvas>
)

export default Story
