import { BufferGeometry, Float32BufferAttribute, Sphere, Vector3 } from 'three'

export class QuadGeometry extends BufferGeometry {
  constructor() {
    super()
    this.boundingSphere = new Sphere()
    this.boundingSphere.set(new Vector3(), Infinity)
    this.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 3, -1, -1, 3], 2)
    )
  }
}
