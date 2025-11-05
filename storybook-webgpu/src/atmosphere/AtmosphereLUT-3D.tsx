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
  AtmosphereParameters,
  type AtmosphereLUTTexture3DName
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

const textureUVW = FnVar((textureSize: Node<'vec3'>, zoom: Node<'float'>) => {
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
})

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
