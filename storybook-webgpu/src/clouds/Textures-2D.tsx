import { ScreenQuad } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, type FC } from 'react'
import { LinearSRGBColorSpace, LinearToneMapping, NoToneMapping } from 'three'
import {
  Discard,
  float,
  Fn,
  If,
  positionGeometry,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec4
} from 'three/tsl'
import { NodeMaterial, type Renderer } from 'three/webgpu'

import type { ProceduralTextureNode } from '@takram/three-clouds/webgpu'
import { FnVar, type NodeObject } from '@takram/three-geospatial/webgpu'

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
  (textureSize: NodeObject<'vec2'>, zoom: NodeObject<'float'>) => {
    const scale = screenSize.div(textureSize).div(zoom).toVar()
    const uv = screenUV.mul(scale).add(scale.oneMinus().mul(0.5)).toVar()
    If(uv.lessThan(0).any().or(uv.greaterThan(1).any()), () => {
      Discard()
    })
    return uv.flipY()
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
  const textureSize = vec2(textureNode.value.width, textureNode.value.height)
  const uv = textureUV(textureSize, zoom)

  material.colorNode = Fn(() => {
    const coord = vec4(uv, uv.sub(0.5)).mul(2)
    const color = float().toVar()
    If(uv.y.greaterThan(0.5), () => {
      If(uv.x.lessThan(0.5), () => {
        color.assign(textureNode.sample(coord.xw).r)
      }).Else(() => {
        color.assign(textureNode.sample(coord.zw).g)
      })
    }).Else(() => {
      If(uv.x.lessThan(0.5), () => {
        color.assign(textureNode.sample(coord.xy).b)
      }).Else(() => {
        color.assign(textureNode.sample(coord.zy).a)
      })
    })
    return color
  })()

  // Tone mapping controls:
  useToneMappingControls()

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
  node: ProceduralTextureNode
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
