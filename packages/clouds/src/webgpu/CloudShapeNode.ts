import { Vector3 } from 'three'
import { vec2, vec3, vec4 } from 'three/tsl'
import type { Node, NodeBuilder } from 'three/webgpu'

import { FnLayout, type NodeObject } from '@takram/three-geospatial/webgpu'

import { CLOUD_SHAPE_TEXTURE_SIZE } from '../constants'
import { ProceduralTexture3DNode } from './ProceduralTexture3DNode'
import { stackablePerlinNoise, stackableWorleyNoise } from './stackableNoise'

export const perlinWorley = /*#__PURE__*/ FnLayout({
  name: 'perlinWorley',
  type: 'float',
  inputs: [{ name: 'point', type: 'vec3' }]
})(([point]) => {
  const octaveCount = 3
  const frequency = 8
  const perlin = stackablePerlinNoise(point, frequency, octaveCount).saturate()

  const cellCount = 4
  const noise = vec3(
    stackableWorleyNoise(point, cellCount * 2),
    stackableWorleyNoise(point, cellCount * 8),
    stackableWorleyNoise(point, cellCount * 14)
  ).oneMinus()
  const fbm = noise.dot(vec3(0.625, 0.25, 0.125))
  return perlin.remap(0, 1, fbm, 1)
})

export const worleyFbm = /*#__PURE__*/ FnLayout({
  name: 'worleyFbm',
  type: 'float',
  inputs: [{ name: 'point', type: 'vec3' }]
})(([point]) => {
  const cellCount = 4
  const noise = vec4(
    stackableWorleyNoise(point, cellCount * 2),
    stackableWorleyNoise(point, cellCount * 4),
    stackableWorleyNoise(point, cellCount * 8),
    stackableWorleyNoise(point, cellCount * 16)
  ).oneMinus()
  const fbm = vec3(
    noise.xyz.dot(vec3(0.625, 0.25, 0.125)),
    noise.yzw.dot(vec3(0.625, 0.25, 0.125)),
    noise.zw.dot(vec2(0.75, 0.25))
  )
  return fbm.dot(vec3(0.625, 0.25, 0.125))
})

export class CloudShapeNode extends ProceduralTexture3DNode {
  override get type(): string {
    return 'CloudShapeNode'
  }

  constructor(size = new Vector3().setScalar(CLOUD_SHAPE_TEXTURE_SIZE)) {
    super(size)
  }

  protected override setupOutputNode(
    uvw: NodeObject<'vec3'>,
    builder: NodeBuilder
  ): Node {
    return perlinWorley(uvw).remap(worleyFbm(uvw).sub(1), 1)
  }
}
