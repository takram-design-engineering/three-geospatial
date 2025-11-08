import { useThree } from '@react-three/fiber'
import type { FC } from 'react'
import { pass, select, uv, vec3 } from 'three/tsl'
import { NodeMaterial, PostProcessing, type Renderer } from 'three/webgpu'

import { colorGrading, rec709ToLinear } from '@takram/three-color-grading'
import {
  ColorGradingControls,
  VideoScopes,
  VideoSource
} from '@takram/three-color-grading/r3f'
import { QuadGeometry } from '@takram/three-geospatial'
import { convertToTexture } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Split, SplitPanel } from '../components/Split'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
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

  const uvNode = uv()
  material.colorNode = rec709ToLinear(
    select(
      uvNode.y.lessThan(0.25),
      vec3(uvNode.x),
      select(
        uvNode.y.lessThan(0.5),
        vec3(uvNode.x, 0, 0),
        select(
          uvNode.y.lessThan(0.75),
          vec3(0, uvNode.x, 0),
          vec3(0, 0, uvNode.x)
        )
      )
    )
  )
  material.needsUpdate = true

  return (
    <>
      <mesh geometry={geometry} material={material} />
      <VideoSource inputNode={videoNode} colorGradingNode={colorGradingNode} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs {}

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
      <ColorGradingControls />
    </SplitPanel>
    <SplitPanel>
      <VideoScopes />
    </SplitPanel>
  </Split>
)

Story.args = {
  ...rendererArgs()
}

Story.argTypes = {
  ...rendererArgTypes()
}

export default Story
