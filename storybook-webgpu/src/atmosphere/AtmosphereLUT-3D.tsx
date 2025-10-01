import { ScreenQuad } from '@react-three/drei'
import type { FC } from 'react'
import { LinearToneMapping } from 'three'
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
import { NodeMaterial } from 'three/webgpu'

import {
  AtmosphereLUTNode,
  type AtmosphereLUTTexture3DName,
  type AtmosphereParameters
} from '@takram/three-atmosphere/webgpu'
import { FnVar, type NodeObject } from '@takram/three-geospatial/webgpu'

import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { Description } from '../helpers/Description'
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

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
    return vec3(uv.fract(), index.toFloat().add(0.5).div(textureSize.z))
  }
)

const Content: FC<StoryProps> = ({ name, ...options }) => {
  const zoom = uniform(0)

  const material = useResource(() => new NodeMaterial(), [])
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const lutNode = useResource(() => new AtmosphereLUTNode(), [])
  Object.assign(lutNode.parameters, options)
  const textureSize = vec3(lutNode.parameters.scatteringTextureSize)
  const uvw = textureUVW(textureSize, zoom)
  material.colorNode = lutNode.getTextureNode(name).sample(uvw).rgb

  // Tone mapping controls:
  useToneMappingControls()

  // Display controls:
  useTransientControl(
    ({ zoom }: StoryArgs) => ({ zoom }),
    value => {
      zoom.value = value.zoom
    }
  )

  return <ScreenQuad material={material} />
}

interface StoryProps extends Partial<AtmosphereParameters> {
  name: AtmosphereLUTTexture3DName
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
