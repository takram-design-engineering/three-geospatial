import { ScreenQuad } from '@react-three/drei'
import type { FC } from 'react'
import { LinearToneMapping } from 'three'
import {
  Discard,
  If,
  or,
  positionGeometry,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec4
} from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import {
  atmosphereLUT,
  type AtmosphereLUTTextureName,
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
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

export const textureUV = FnVar(
  (textureSize: NodeObject<'vec2'>, zoom: NodeObject<'float'>) => {
    const scale = screenSize.div(textureSize).div(zoom).toVar()
    const uv = screenUV.mul(scale).add(scale.oneMinus().mul(0.5)).toVar()
    If(
      or(
        uv.x.lessThan(0),
        uv.x.greaterThan(1),
        uv.y.lessThan(0),
        uv.y.greaterThan(1)
      ),
      () => {
        Discard()
      }
    )
    return vec2(uv.x, uv.y.oneMinus())
  }
)

const Content: FC<StoryProps> = ({ name, ...options }) => {
  const zoom = uniform(0)

  const material = useResource(() => new NodeMaterial(), [])
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const lutNode = useResource(() => atmosphereLUT(), [])
  Object.assign(lutNode.parameters, options)
  const textureSize = vec2(lutNode.parameters[`${name}TextureSize`])
  const uv = textureUV(textureSize, zoom)

  material.colorNode = lutNode.getTextureNode(name).sample(uv).rgb

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
  name: AtmosphereLUTTextureName
}

interface StoryArgs extends ToneMappingArgs {
  zoom: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
  </WebGPUCanvas>
)

Story.args = {
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
