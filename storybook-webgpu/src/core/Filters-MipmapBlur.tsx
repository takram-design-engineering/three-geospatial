import { useMemo, type FC } from 'react'
import { Mesh } from 'three'
import { positionGeometry, vec4 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import { QuadGeometry } from '@takram/three-geospatial'
import { mipmapBlur } from '@takram/three-geospatial/webgpu'

import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import type { StoryFC } from '../helpers/createStory'
import { useControl } from '../helpers/useControl'
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { useFilterTextureNode } from './helpers/useFilterTextureNode'

const Scene: FC<StoryProps> = () => {
  const levels = useControl(({ levels }: StoryArgs) => levels)

  const textureNode = useFilterTextureNode()
  const fragmentNode = useResource(
    () => mipmapBlur(textureNode, levels),
    [textureNode, levels]
  )

  const material = useResource(() => {
    const material = new NodeMaterial()
    material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    return material
  }, [])

  material.fragmentNode = fragmentNode
  material.needsUpdate = true

  useTransientControl(
    ({ resolutionScale }: StoryArgs) => resolutionScale,
    value => {
      fragmentNode.resolutionScale = value
      fragmentNode.needsUpdate = true
    }
  )

  const geometry = useResource(() => new QuadGeometry(), [])
  const mesh = useMemo(() => new Mesh(geometry, material), [geometry, material])

  return <primitive object={mesh} />
}

interface StoryProps {}

interface StoryArgs {
  levels: number
  resolutionScale: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  levels: 4,
  resolutionScale: 1,
  ...rendererArgs()
}

Story.argTypes = {
  levels: {
    control: {
      type: 'range',
      min: 2,
      max: 8,
      step: 1
    }
  },
  resolutionScale: {
    control: {
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.01
    }
  },
  ...rendererArgTypes()
}

export default Story
