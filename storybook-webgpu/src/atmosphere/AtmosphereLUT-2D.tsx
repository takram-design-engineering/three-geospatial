import { ScreenQuad } from '@react-three/drei'
import type { FC } from 'react'
import { LinearToneMapping } from 'three'
import {
  Discard,
  If,
  positionGeometry,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec4
} from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import {
  AtmosphereLUTNode,
  AtmosphereParameters,
  type AtmosphereLUTTextureName
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'
import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

export const textureUV = FnVar(
  (textureSize: Node<'vec2'>, zoom: Node<'float'>) => {
    const scale = screenSize.div(textureSize).div(zoom).toVar()
    const uv = screenUV.mul(scale).add(scale.oneMinus().mul(0.5)).toVar()
    If(uv.lessThan(0).any().or(uv.greaterThan(1).any()), () => {
      Discard()
    })
    return uv.flipY()
  }
)

const Content: FC<StoryProps> = ({ name, ...options }) => {
  const zoom = uniform(0)

  const material = useResource(() => new NodeMaterial(), [])
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const lutNode = useResource(() => {
    const parameters = new AtmosphereParameters()
    parameters.groundAlbedo.setScalar(0.1)
    parameters.minCosSun = Math.cos(radians(120))
    return new AtmosphereLUTNode(parameters)
  }, [])
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
    <Description />
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
