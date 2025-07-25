import { ScreenQuad } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type FC } from 'react'
import {
  Discard,
  Fn,
  If,
  or,
  positionGeometry,
  screenSize,
  screenUV,
  texture,
  vec2,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import { NodeMaterial, type Node, type Renderer } from 'three/webgpu'

import {
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from '@takram/three-atmosphere'
import { AtmosphereLUT } from '@takram/three-atmosphere/webgpu'
import { Fnv } from '@takram/three-geospatial/webgpu'

import { WebGPUCanvas } from '../../helpers/webgpu/WebGPUCanvas'

const screenCenterUV = Fnv(
  (size: ShaderNodeObject<Node>, zoom: ShaderNodeObject<Node>) => {
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

const Content: FC = () => {
  const renderer = useThree(({ gl }) => gl) as unknown as Renderer
  const lut = useMemo(() => new AtmosphereLUT(renderer), [renderer])

  useEffect(() => {
    void lut.update()
  }, [lut])

  const material = useMemo(() => {
    const material = new NodeMaterial()
    material.vertexNode = Fn(() => {
      return vec4(positionGeometry.xy, 0, 1)
    })()

    material.colorNode = Fn(() => {
      const size = vec2(
        TRANSMITTANCE_TEXTURE_WIDTH,
        TRANSMITTANCE_TEXTURE_HEIGHT
      ).toConst()
      const uv = screenCenterUV(size, 4)
      return texture(lut.irradianceTexture).sample(uv).mul(100)
    })()
    return material
  }, [lut])

  return <ScreenQuad material={material} />
}

export const Story: FC = () => (
  <WebGPUCanvas>
    <Content />
  </WebGPUCanvas>
)

export default Story
