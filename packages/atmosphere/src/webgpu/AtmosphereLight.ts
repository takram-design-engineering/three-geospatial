import { Light, Matrix4, Vector3 } from 'three'

import { Ellipsoid } from '@takram/three-geospatial'
import { nodeType } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'

export class AtmosphereLight extends Light {
  override readonly type = 'AtmosphereLight'

  lutNode?: AtmosphereLUTNode

  @nodeType('mat4')
  worldToECEFMatrix = new Matrix4().identity()

  @nodeType('vec3')
  sunDirectionECEF = new Vector3().copy(Light.DEFAULT_UP)

  ellipsoid = Ellipsoid.WGS84
  correctAltitude = true

  constructor(lutNode?: AtmosphereLUTNode) {
    super()
    this.lutNode = lutNode
  }

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive)
    this.lutNode = source.lutNode
    this.ellipsoid = source.ellipsoid
    this.sunDirectionECEF.copy(source.sunDirectionECEF)
    this.worldToECEFMatrix.copy(source.worldToECEFMatrix)
    this.correctAltitude = source.correctAltitude
    return this
  }
}
