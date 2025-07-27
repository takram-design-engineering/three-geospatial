import { ScreenQuad } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, type FC } from 'react'
import {
  Discard,
  float,
  Fn,
  fract,
  If,
  int,
  ivec2,
  positionGeometry,
  screenSize,
  screenUV,
  texture3D,
  vec2,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import { NodeMaterial, type Node, type Renderer } from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH
} from '@takram/three-atmosphere'
import { AtmosphereLUT } from '@takram/three-atmosphere/webgpu'
import { Fnv } from '@takram/three-geospatial/webgpu'

import { WebGPUCanvas } from '../../helpers/webgpu/WebGPUCanvas'

const screenCenterUVW = Fnv(
  (size: ShaderNodeObject<Node>, zoom: ShaderNodeObject<Node>) => {
    const uv = vec2(screenUV.x, screenUV.y)
      .mul(screenSize)
      .div(size.xy)
      .div(zoom)
    const xy = ivec2(uv)
    const columns = int(5)
    If(xy.x.greaterThanEqual(columns), () => {
      Discard()
    })
    const index = xy.y.mul(columns).add(xy.x.mod(columns))
    If(index.greaterThanEqual(size.z), () => {
      Discard()
    })
    return vec3(fract(uv), float(index).add(0.5).div(size.z))
  }
)

const Content: FC = () => {
  const renderer = useThree(({ gl }) => gl) as unknown as Renderer
  const lut = useMemo(
    () =>
      new AtmosphereLUT(renderer, {
        combinedScattering: false
      }),
    [renderer]
  )

  useEffect(() => {
    void lut.update()
  }, [lut])

  const material = useMemo(() => {
    const material = new NodeMaterial()
    material.vertexNode = Fn(() => {
      return vec4(positionGeometry.xy, 0, 1)
    })()

    material.colorNode = Fn(() => {
      const size = vec3(
        SCATTERING_TEXTURE_WIDTH,
        SCATTERING_TEXTURE_HEIGHT,
        SCATTERING_TEXTURE_DEPTH
      ).toConst()
      const uvw = screenCenterUVW(size, 2)
      invariant(lut.singleMieScatteringTexture != null)
      return texture3D(lut.singleMieScatteringTexture).sample(uvw).rgb.mul(0.5)
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
