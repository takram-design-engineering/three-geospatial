import { BufferAttribute, BufferGeometry, Points } from 'three'
import { instanceIndex, screenSize, uvec2, vec3, vec4 } from 'three/tsl'
import { PointsNodeMaterial, type NodeMaterial } from 'three/webgpu'

import type { ShadowLengthNode } from './ShadowLengthNode'
import { isValidScreenLocation } from './ShadowLengthNode/common'

export class ShadowLengthSampleLocations extends Points {
  declare material: NodeMaterial

  constructor(shadowLengthNode: ShadowLengthNode) {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(3), 3)
    )
    geometry.drawRange.count = 1 // Force render points as instances

    const material = new PointsNodeMaterial()
    material.depthTest = false
    material.depthWrite = false

    const { maxSamplesInSlice, numEpipolarSlices, coordinateNode } =
      shadowLengthNode
    const sampleIndex = instanceIndex.mod(maxSamplesInSlice)
    const sliceIndex = instanceIndex.div(maxSamplesInSlice)

    const coordinate = coordinateNode
      .getTextureNode()
      .load(uvec2(sampleIndex, sliceIndex))

    const isValid = isValidScreenLocation(coordinate.xy, screenSize)
      .toUint()
      .toVertexStage()

    material.vertexNode = isValid.select(
      vec4(coordinate.xy, 0, 1),
      vec4(2, 2, 0, 1)
    )
    material.colorNode = isValid.select(vec3(1, 0, 0), vec3())

    super(geometry, material)

    this.count = maxSamplesInSlice * numEpipolarSlices
    this.frustumCulled = false
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
