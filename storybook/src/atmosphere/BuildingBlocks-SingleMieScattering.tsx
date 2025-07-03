import { Canvas, useLoader, useThree } from '@react-three/fiber'
import type { StoryFn } from '@storybook/react-vite'
import { useEffect, useMemo, type FC } from 'react'

import {
  PrecomputedTexturesGenerator,
  PrecomputedTexturesLoader
} from '@takram/three-atmosphere'

import { useControls } from '../helpers/useControls'
import { Data3DTextureViewer } from './helpers/Data3DTextureViewer'

const binaryLoader = new PrecomputedTexturesLoader({
  format: 'binary',
  combinedScattering: false
})
const exrLoader = new PrecomputedTexturesLoader({
  format: 'exr',
  combinedScattering: false
})

const Content: FC = () => {
  const { source } = useControls({
    source: {
      options: ['generator', 'binary', 'exr'] as const
    }
  })

  const renderer = useThree(({ gl }) => gl)
  const generator = useMemo(
    () =>
      new PrecomputedTexturesGenerator(renderer, {
        combinedScattering: false
      }),
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

  const texture =
    source === 'generator'
      ? generator.textures.singleMieScatteringTexture
      : textures.singleMieScatteringTexture

  if (texture == null) {
    return
  }
  return (
    <Data3DTextureViewer
      texture={texture}
      name='single_mie_scattering'
      valueScale={0.5}
    />
  )
}

const Story: StoryFn = () => (
  <Canvas>
    <Content />
  </Canvas>
)

export default Story
