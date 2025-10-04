import { Suspense, useMemo, type FC } from 'react'
import { Mesh } from 'three'
import { positionGeometry, vec4 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import { QuadGeometry } from '@takram/three-geospatial'
import { gaussianBlur } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'
import { useFilterTextureNode } from './useFilterTextureNode'

const Content: FC<StoryProps> = () => {
  const kernelSize = useControl(({ kernelSize }: StoryArgs) => kernelSize)

  const textureNode = useFilterTextureNode()
  const filterNode = useResource(
    () => gaussianBlur(textureNode, kernelSize),
    [textureNode, kernelSize]
  )

  const material = useResource(() => {
    const material = new NodeMaterial()
    material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    return material
  }, [])

  material.fragmentNode = filterNode
  material.needsUpdate = true

  useTransientControl(
    ({ iterations, resolutionScale }: StoryArgs) => ({
      iterations,
      resolutionScale
    }),
    ({ iterations, resolutionScale }) => {
      filterNode.iterations = iterations
      filterNode.resolutionScale = resolutionScale
      filterNode.needsUpdate = true
    }
  )

  const geometry = useResource(() => new QuadGeometry(), [])
  const mesh = useMemo(() => new Mesh(geometry, material), [geometry, material])

  return <primitive object={mesh} />
}

interface StoryProps {}

interface StoryArgs {
  kernelSize: number
  iterations: number
  resolutionScale: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Suspense>
      <Content {...props} />
    </Suspense>
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  kernelSize: 35,
  iterations: 1,
  resolutionScale: 1,
  ...rendererArgs()
}

Story.argTypes = {
  kernelSize: {
    control: {
      type: 'range',
      min: 3,
      max: 127,
      step: 2
    }
  },
  iterations: {
    control: {
      type: 'range',
      min: 1,
      max: 10,
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
