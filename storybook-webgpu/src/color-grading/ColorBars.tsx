import { useThree } from '@react-three/fiber'
import type { FC } from 'react'
import { pass, uv } from 'three/tsl'
import {
  NodeMaterial,
  NoToneMapping,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  colorBarsHD,
  colorBarsSD,
  colorGrading
} from '@takram/three-color-grading'
import {
  ColorGrading,
  VideoScopes,
  VideoSource
} from '@takram/three-color-grading/r3f'
import { QuadGeometry } from '@takram/three-geospatial'
import { convertToTexture } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Split, SplitPanel } from '../components/Split'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping

  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const [postProcessing, colorGradingNode, videoNode] = useResource(
    manage => {
      const passNode = manage(pass(scene, camera, { samples: 0 }))
      const colorGradingNode = manage(colorGrading(passNode))
      const videoNode = manage(convertToTexture(colorGradingNode))
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = videoNode
      return [postProcessing, colorGradingNode, videoNode]
    },
    [renderer, camera, scene]
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  const geometry = useResource(() => new QuadGeometry(), [])
  const material = useResource(() => new NodeMaterial(), [])

  const type = useControl(({ type }: StoryArgs) => type)
  material.colorNode = type === 'hd' ? colorBarsHD(uv()) : colorBarsSD(uv())
  material.needsUpdate = true

  return (
    <>
      <mesh geometry={geometry} material={material} />
      <VideoSource inputNode={videoNode} colorGradingNode={colorGradingNode} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs {
  type: 'sd' | 'hd'
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <Split>
    <SplitPanel>
      <WebGPUCanvas
        camera={{
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
          position: [0, 0, 1]
        }}
        orthographic
      >
        <Content {...props} />
      </WebGPUCanvas>
    </SplitPanel>
    <SplitPanel>
      <ColorGrading />
    </SplitPanel>
    <SplitPanel>
      <VideoScopes />
    </SplitPanel>
  </Split>
)

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
