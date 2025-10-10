import { ScreenQuad } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, type FC } from 'react'
import { LinearSRGBColorSpace, LinearToneMapping, NoToneMapping } from 'three'
import {
  Discard,
  floor,
  If,
  ivec2,
  max,
  positionGeometry,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { NodeMaterial, type Renderer } from 'three/webgpu'

import type { ProceduralTexture3DNode } from '@takram/three-clouds/webgpu'
import { FnVar, type NodeObject } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const textureUVW = FnVar(
  (textureSize: NodeObject<'vec3'>, zoom: NodeObject<'float'>) => {
    const uv = vec2(screenUV.x, screenUV.y)
      .mul(screenSize)
      .div(textureSize.xy)
      .div(zoom)
    const xy = ivec2(uv)
    const columns = max(floor(screenSize.x.div(textureSize.x.mul(zoom))), 1)
    If(xy.x.greaterThanEqual(columns), () => {
      Discard()
    })
    const index = xy.y.mul(columns).add(xy.x.mod(columns))
    If(index.greaterThanEqual(textureSize.z), () => {
      Discard()
    })
    return vec3(uv.fract(), index.toFloat().div(textureSize.z))
  }
)

const Content: FC<StoryProps> = ({ node }) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  renderer.toneMapping = NoToneMapping
  renderer.outputColorSpace = LinearSRGBColorSpace

  const zoom = uniform(0)

  const material = useResource(() => new NodeMaterial(), [])
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const textureNode = node.getTextureNode()
  const textureSize = vec3(
    textureNode.value.width,
    textureNode.value.height,
    textureNode.value.depth
  )
  const uvw = textureUVW(textureSize, zoom)
  material.colorNode = textureNode.sample(uvw).rgb

  // Display controls:
  useTransientControl(
    ({ zoom }: StoryArgs) => ({ zoom }),
    value => {
      zoom.value = value.zoom
    }
  )

  useEffect(() => {
    return () => {
      node.dispose()
    }
  }, [node])

  return <ScreenQuad material={material} />
}

interface StoryProps {
  node: ProceduralTexture3DNode
}

interface StoryArgs extends ToneMappingArgs {
  zoom: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  zoom: 1,
  ...toneMappingArgs({
    toneMapping: LinearToneMapping
  }),
  ...rendererArgs()
}

Story.argTypes = {
  zoom: {
    control: {
      type: 'range',
      min: 1,
      max: 32,
      step: 0.1
    }
  },
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
