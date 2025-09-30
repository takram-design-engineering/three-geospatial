import { BufferGeometry, Float32BufferAttribute, Sphere, Vector3 } from 'three'

export class QuadGeometry extends BufferGeometry {
  constructor() {
    super()
    this.boundingSphere = new Sphere()
    this.boundingSphere.set(new Vector3(), Infinity)
    this.setAttribute(
      'position',
      new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)
    )
    this.setAttribute('uv', new Float32BufferAttribute([0, -1, 0, 1, 2, 1], 2))
  }
}
