import { ScreenQuad } from '@react-three/drei'
import type { FC } from 'react'
import {
  Discard,
  If,
  or,
  positionGeometry,
  pow,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec4
} from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import {
  atmosphereLUT,
  type AtmosphereLUTTextureName
} from '@takram/three-atmosphere/webgpu'
import { Fnv, type ShaderNode } from '@takram/three-geospatial/webgpu'

import { useTransientControl, type StoryFC } from '../helpers/StoryControls'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

export const textureUV = Fnv(
  (size: ShaderNode<'vec2'>, zoom: ShaderNode<'float'>) => {
    const scale = screenSize.div(size).div(zoom).toVar()
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

const Content: FC<StoryProps> = ({ name }) => {
  const zoom = uniform(0)
  const valueExponent = uniform(0)

  const material = useResource(() => new NodeMaterial())
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const lutNode = useResource(() => atmosphereLUT())
  const size = vec2(lutNode.parameters[`${name}TextureSize`])
  const uv = textureUV(size, zoom)

  material.colorNode = lutNode
    .getTextureNode(name)
    .sample(uv)
    .mul(pow(10, valueExponent))

  useTransientControl(
    ({ zoom, valueExponent }: StoryArgs) => ({ zoom, valueExponent }),
    value => {
      zoom.value = value.zoom
      valueExponent.value = value.valueExponent
    }
  )

  return <ScreenQuad material={material} />
}

interface StoryProps {
  name: AtmosphereLUTTextureName<2>
}

interface StoryArgs {
  zoom: number
  valueExponent: number
}

export const Story2D: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
  </WebGPUCanvas>
)

export default Story2D
