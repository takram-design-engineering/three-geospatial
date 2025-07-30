import { ScreenQuad } from '@react-three/drei'
import type { FC } from 'react'
import {
  Discard,
  float,
  floor,
  If,
  ivec2,
  max,
  positionGeometry,
  pow,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import {
  atmosphereLUT,
  type AtmosphereLUTTextureName,
  type AtmosphereParameters
} from '@takram/three-atmosphere/webgpu'
import { Fnv, type ShaderNode } from '@takram/three-geospatial/webgpu'

import { useTransientControl, type StoryFC } from '../helpers/StoryControls'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

export const textureUVW = Fnv(
  (textureSize: ShaderNode<'vec3'>, zoom: ShaderNode<'float'>) => {
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
    return vec3(uv.fract(), float(index).add(0.5).div(textureSize.z))
  }
)

const Content: FC<StoryProps> = ({ name, ...options }) => {
  const zoom = uniform(0)
  const valueExponent = uniform(0)

  const material = useResource(() => new NodeMaterial())
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)

  const lutNode = useResource(() => atmosphereLUT())
  Object.assign(lutNode.parameters, options)
  const textureSize = vec3(lutNode.parameters.scatteringTextureSize)
  const uvw = textureUVW(textureSize, zoom)
  material.colorNode = lutNode
    .getTextureNode(name)
    .sample(uvw)
    .rgb.mul(pow(10, valueExponent))

  useTransientControl(
    ({ zoom, valueExponent }: StoryArgs) => ({ zoom, valueExponent }),
    value => {
      zoom.value = value.zoom
      valueExponent.value = value.valueExponent
    }
  )

  return <ScreenQuad material={material} />
}

interface StoryProps extends Partial<AtmosphereParameters> {
  name: AtmosphereLUTTextureName<3>
}

interface StoryArgs {
  zoom: number
  valueExponent: number
}

export const Story3D: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
  </WebGPUCanvas>
)

export default Story3D
