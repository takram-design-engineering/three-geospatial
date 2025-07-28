import { ScreenQuad } from '@react-three/drei'
import { useMemo, type FC } from 'react'
import { Fn, positionGeometry, vec3, vec4 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

import { atmosphereLUT } from '@takram/three-atmosphere/webgpu'

import { WebGPUCanvas } from '../../helpers/webgpu/WebGPUCanvas'
import { wrapTileUVW } from './helpers/wrapTileUVW'

const Content: FC = () => {
  const material = useMemo(() => {
    const material = new NodeMaterial()
    material.vertexNode = Fn(() => {
      return vec4(positionGeometry.xy, 0, 1)
    })()

    material.colorNode = Fn(() => {
      const lut = atmosphereLUT()
      const size = vec3(lut.atmosphere.scatteringTextureSize)
      const uvw = wrapTileUVW(size, 2)
      return lut.getTextureNode('scattering').sample(uvw).rgb.mul(0.5)
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
