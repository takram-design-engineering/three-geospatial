import { ScreenQuad } from '@react-three/drei'
import { useMemo, type FC } from 'react'
import { Fn, positionGeometry, vec2, vec4 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import { atmosphereLUT } from '@takram/three-atmosphere/webgpu'

import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { screenCenterUV } from './helpers/screenCenterUV'

const Content: FC = () => {
  const material = useMemo(() => {
    const material = new NodeMaterial()
    material.vertexNode = Fn(() => {
      return vec4(positionGeometry.xy, 0, 1)
    })()

    material.colorNode = Fn(() => {
      const lut = atmosphereLUT()
      const size = vec2(lut.parameters.transmittanceTextureSize)
      const uv = screenCenterUV(size, 4)
      return lut.getTextureNode('transmittance').sample(uv)
    })()
    return material
  }, [])

  return <ScreenQuad material={material} />
}

export const Story: FC = () => (
  <WebGPUCanvas>
    <Content />
  </WebGPUCanvas>
)

export default Story
