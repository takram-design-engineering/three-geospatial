import { vec2, vec3, vec4 } from 'three/tsl'
import { Vector3, type Node, type NodeBuilder } from 'three/webgpu'

import type { NodeObject } from '@takram/three-geospatial/webgpu'

import { CLOUD_SHAPE_DETAIL_TEXTURE_SIZE } from '../constants'
import { ProceduralTexture3DNode } from './ProceduralTexture3DNode'
import { worleyNoise } from './tileableNoise'

export class CloudShapeDetailNode extends ProceduralTexture3DNode {
  override get type(): string {
    return 'CloudShapeDetailNode'
  }

  constructor(size = new Vector3().setScalar(CLOUD_SHAPE_DETAIL_TEXTURE_SIZE)) {
    super(size)
  }

  protected override setupOutputNode(
    uvw: NodeObject<'vec3'>,
    builder: NodeBuilder
  ): Node {
    const cellCount = 2
    const noise = vec4(
      worleyNoise(uvw, cellCount),
      worleyNoise(uvw, cellCount * 2),
      worleyNoise(uvw, cellCount * 4),
      worleyNoise(uvw, cellCount * 8)
    ).oneMinus()
    const fbm = vec3(
      noise.xyz.dot(vec3(0.625, 0.25, 0.125)),
      noise.yzw.dot(vec3(0.625, 0.25, 0.125)),
      noise.zw.dot(vec2(0.75, 0.25))
    )
    return fbm.dot(vec3(0.625, 0.25, 0.125))
  }
}
