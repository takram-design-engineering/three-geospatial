import { useThree } from '@react-three/fiber'
import type { FC } from 'react'
import { pass, uv } from 'three/tsl'
import { NodeMaterial, PostProcessing, type Renderer } from 'three/webgpu'

import {
  colorBars,
  colorBarsHD,
  type VideoSource
} from '@takram/three-color-grading'
import { useVideoSource, VideoScopes } from '@takram/three-color-grading/r3f'
import { QuadGeometry } from '@takram/three-geospatial'

import type { StoryFC } from '../components/createStory'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'

const Content: FC<
  StoryProps & {
    source: VideoSource
  }
> = ({ source }) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const postProcessing = useResource(
    manage => {
      const passNode = manage(pass(scene, camera, { samples: 0 }))
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = passNode

      source?.setInputNode(passNode)

      return postProcessing
    },
    [renderer, camera, scene, source]
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  const geometry = useResource(() => new QuadGeometry(), [])
  const material = useResource(() => new NodeMaterial(), [])

  const type = useControl(({ type }: StoryArgs) => type)
  material.colorNode = type === 'hd' ? colorBarsHD(uv()) : colorBars(uv())
  material.needsUpdate = true

  return <mesh geometry={geometry} material={material} />
}

interface StoryProps {}

interface StoryArgs {
  type: 'sd' | 'hd'
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => {
  const source = useVideoSource()
  return (
    <VideoScopes source={source}>
      <WebGPUCanvas
        rendererRef={source.setRenderer}
        camera={{
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
          position: [0, 0, 1]
        }}
        orthographic
      >
        <Content {...props} source={source} />
      </WebGPUCanvas>
    </VideoScopes>
  )
}

Story.args = {
  type: 'hd',
  ...rendererArgs()
}

Story.argTypes = {
  type: {
    options: ['sd', 'hd'],
    control: {
      type: 'select',
      labels: {
        sd: 'SD',
        hd: 'HD'
      }
    }
  },
  ...rendererArgTypes()
}

export default Story
