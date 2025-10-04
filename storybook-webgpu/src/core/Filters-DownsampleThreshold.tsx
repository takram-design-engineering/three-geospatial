import { Suspense, useMemo, type FC } from 'react'
import { Mesh } from 'three'
import { positionGeometry, vec4 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import { QuadGeometry } from '@takram/three-geospatial'
import { downsampleThreshold } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'
import { useFilterTextureNode } from './useFilterTextureNode'

const Content: FC<StoryProps> = () => {
  const textureNode = useFilterTextureNode()
  const filterNode = useResource(
    () => downsampleThreshold(textureNode),
    [textureNode]
  )

  const material = useResource(() => {
    const material = new NodeMaterial()
    material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    return material
  }, [])

  material.fragmentNode = vec4(filterNode.rgb, 1) // Alpha channel stores luminance
  material.needsUpdate = true

  useTransientControl(
    ({ thresholdLevel, thresholdRange }: StoryArgs) => ({
      thresholdLevel,
      thresholdRange
    }),
    ({ thresholdLevel, thresholdRange }) => {
      filterNode.thresholdLevel.value = thresholdLevel
      filterNode.thresholdRange.value = thresholdRange
    }
  )

  useTransientControl(
    ({ resolutionScale }: StoryArgs) => resolutionScale,
    value => {
      filterNode.resolutionScale = value
      filterNode.needsUpdate = true
    }
  )

  const geometry = useResource(() => new QuadGeometry(), [])
  const mesh = useMemo(() => new Mesh(geometry, material), [geometry, material])

  return <primitive object={mesh} />
}

interface StoryProps {}

interface StoryArgs {
  thresholdLevel: number
  thresholdRange: number
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
  thresholdLevel: 0.5,
  thresholdRange: 0.1,
  resolutionScale: 0.25,
  ...rendererArgs()
}

Story.argTypes = {
  thresholdLevel: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    }
  },
  thresholdRange: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
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
