import { Matrix4, Vector3, type Camera } from 'three'
import { uniform } from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'

import { Ellipsoid, Geodetic } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereContextBase } from './AtmosphereContextBase'
import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export class AtmosphereContext extends AtmosphereContextBase {
  lutNode: AtmosphereLUTNode

  matrixWorldToECEF = uniform(new Matrix4()).setName('matrixWorldToECEF')
  matrixECIToECEF = uniform(new Matrix4()).setName('matrixECIToECEF')
  sunDirectionECEF = uniform(new Vector3()).setName('sunDirectionECEF')
  moonDirectionECEF = uniform(new Vector3()).setName('moonDirectionECEF')
  matrixMoonFixedToECEF = uniform(new Matrix4()).setName(
    'matrixMoonFixedToECEF'
  )

  matrixECEFToWorld = uniform(new Matrix4())
    .setName('matrixECEFToWorld')
    .onRenderUpdate((_, { value }) => {
      // The matrixWorldToECEF must be orthogonal.
      value.copy(this.matrixWorldToECEF.value).transpose()
    })

  cameraPositionECEF = uniform(new Vector3())
    .setName('cameraPositionECEF')
    .onRenderUpdate((frame, { value }) => {
      const camera = this.camera ?? frame.camera
      if (camera == null) {
        return
      }
      value
        .setFromMatrixPosition(camera.matrixWorld)
        .applyMatrix4(this.matrixWorldToECEF.value)
    })

  altitudeCorrectionECEF = uniform(new Vector3())
    .setName('altitudeCorrectionECEF')
    .onRenderUpdate((frame, { value }) => {
      const camera = this.camera ?? frame.camera
      if (camera == null) {
        return
      }
      getAltitudeCorrectionOffset(
        value
          .setFromMatrixPosition(camera.matrixWorld)
          .applyMatrix4(this.matrixWorldToECEF.value),
        this.parameters.bottomRadius,
        this.ellipsoid,
        value
      )
    })

  cameraHeight = uniform(0)
    .setName('cameraHeight')
    .onRenderUpdate((frame, self) => {
      const camera = this.camera ?? frame.camera
      if (camera == null) {
        return
      }
      const positionECEF = vectorScratch
        .setFromMatrixPosition(camera.matrixWorld)
        .applyMatrix4(this.matrixWorldToECEF.value)
      self.value = geodeticScratch.setFromECEF(positionECEF).height
    })

  cameraPositionUnit = this.cameraPositionECEF
    .mul(this.worldToUnit)
    .toConst('cameraPositionUnit')

  altitudeCorrectionUnit = this.altitudeCorrectionECEF
    .mul(this.worldToUnit)
    .toConst('altitudeCorrectionUnit')

  camera?: Camera
  ellipsoid = Ellipsoid.WGS84
  correctAltitude = true
  constrainCamera = true
  showGround = true

  constructor(
    parameters = new AtmosphereParameters(),
    lutNode = new AtmosphereLUTNode(parameters)
  ) {
    super(parameters)
    this.lutNode = lutNode
  }

  override dispose(): void {
    this.lutNode.dispose()
    super.dispose()
  }
}

/** @deprecated Use AtmosphereContext instead. */
export const AtmosphereContextNode = AtmosphereContext

export function getAtmosphereContext(builder: NodeBuilder): AtmosphereContext {
  if (typeof builder.context.getAtmosphere !== 'function') {
    throw new Error('getAtmosphere() was not found in the builder context.')
  }
  const context = builder.context.getAtmosphere()
  if (!(context instanceof AtmosphereContext)) {
    throw new Error(
      'getAtmosphere() must return an instanceof AtmosphereContext.'
    )
  }
  return context
}
