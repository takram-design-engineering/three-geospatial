import { Vector2 } from 'three'
import { int, vec3 } from 'three/tsl'
import type { Node, NodeBuilder } from 'three/webgpu'

import { FnLayout, type NodeObject } from '@takram/three-geospatial/webgpu'

import { ProceduralTextureNode } from './ProceduralTextureNode'
import { getPerlinNoise } from './tileableNoise'

const perlin = (point: NodeObject<'vec3'>): NodeObject<'float'> => {
  return getPerlinNoise(point, vec3(12), int(3))
}

const perlin3D = /*#__PURE__*/ FnLayout({
  name: 'perlin3D',
  type: 'vec3',
  inputs: [{ name: 'point', type: 'vec3' }]
})(([point]) => {
  const perlin1 = perlin(point)
  const perlin2 = perlin(point.yzx.add(vec3(-19.1, 33.4, 47.2)))
  const perlin3 = perlin(point.zxy.add(vec3(74.2, -124.5, 99.4)))
  return vec3(perlin1, perlin2, perlin3)
})

const curl = /*#__PURE__*/ FnLayout({
  name: 'curl',
  type: 'vec3',
  inputs: [{ name: 'point', type: 'vec3' }]
})(([point]) => {
  const delta = 0.1
  const dx = vec3(delta, 0, 0)
  const dy = vec3(0, delta, 0)
  const dz = vec3(0, 0, delta)

  const px0 = perlin3D(point.sub(dx))
  const px1 = perlin3D(point.add(dx))
  const py0 = perlin3D(point.sub(dy))
  const py1 = perlin3D(point.add(dy))
  const pz0 = perlin3D(point.sub(dz))
  const pz1 = perlin3D(point.add(dz))

  const x = py1.z.sub(py0.z).sub(pz1.y).add(pz0.y)
  const y = pz1.x.sub(pz0.x).sub(px1.z).add(px0.z)
  const z = px1.y.sub(px0.y).sub(py1.x).add(py0.x)

  return vec3(x, y, z)
    .mul(1 / (delta * 2))
    .normalize()
})

export class TurbulenceNode extends ProceduralTextureNode {
  override get type(): string {
    return 'TurbulenceNode'
  }

  constructor(size = new Vector2().setScalar(128)) {
    super(size)
  }

  protected override setupOutputNode(
    position: NodeObject<'vec2'>,
    builder: NodeBuilder
  ): Node {
    return curl(vec3(position, 0)).mul(0.5).add(0.5)
  }
}
