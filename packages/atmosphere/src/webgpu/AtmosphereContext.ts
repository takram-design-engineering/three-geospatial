import { Vector2, Vector3, type Camera } from 'three'
import { renderGroup, uniform } from 'three/tsl'
import { NodeBuilder, type Renderer } from 'three/webgpu'

import { Ellipsoid, Geodetic } from '@takram/three-geospatial'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import { AtmosphereContextBase } from './AtmosphereContextBase'
import { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export class AtmosphereContext extends AtmosphereContextBase {
  lutNode: AtmosphereLUTNode

  matrixWorldToECEF = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixWorldToECEF')

  matrixECIToECEF = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixECIToECEF')

  sunDirectionECEF = uniform('vec3')
    .setGroup(renderGroup)
    .setName('sunDirectionECEF')

  moonDirectionECEF = uniform('vec3')
    .setGroup(renderGroup)
    .setName('moonDirectionECEF')

  matrixMoonFixedToECEF = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixMoonFixedToECEF')

  scatteringSampleCount = uniform(new Vector2(4, 14))
    .setGroup(renderGroup)
    .setName('scatteringSampleCount')

  matrixViewToECEF = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixViewToECEF')
    .onRenderUpdate((frame, { value }) => {
      const camera = this.camera ?? frame.camera
      if (camera == null) {
        return
      }
      value.multiplyMatrices(this.matrixWorldToECEF.value, camera.matrixWorld)
    })

  matrixECEFToWorld = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixECEFToWorld')
    .onRenderUpdate((_, { value }) => {
      value.copy(this.matrixWorldToECEF.value).invert()
    })

  matrixECEFToView = uniform('mat4')
    .setGroup(renderGroup)
    .setName('matrixECEFToView')
    .onRenderUpdate((frame, { value }) => {
      const camera = this.camera ?? frame.camera
      if (camera == null) {
        return
      }
      value.multiplyMatrices(
        camera.matrixWorldInverse,
        value.copy(this.matrixWorldToECEF.value).invert()
      )
    })

  cameraPositionECEF = uniform('vec3')
    .setGroup(renderGroup)
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

  altitudeCorrectionECEF = uniform('vec3')
    .setGroup(renderGroup)
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
    .setGroup(renderGroup)
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
    .mul(this.parametersNode.worldToUnit)
    .toVar('cameraPositionUnit') // BUG: Cannot use toConst() here

  altitudeCorrectionUnit = this.altitudeCorrectionECEF
    .mul(this.parametersNode.worldToUnit)
    .toVar('altitudeCorrectionUnit') // BUG: Cannot use toConst() here

  camera?: Camera
  ellipsoid = Ellipsoid.WGS84
  correctAltitude = true
  constrainCamera = true
  showGround = true
  accurateShadowScattering = true
  raymarchScattering = true

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

export function getAtmosphereContext(
  host: NodeBuilder | Renderer
): AtmosphereContext {
  const hostContext =
    host instanceof NodeBuilder ? host.context : host.contextNode.value
  if (typeof hostContext.getAtmosphere !== 'function') {
    throw new Error('getAtmosphere() was not found in the context.')
  }
  const atmosphereContext = hostContext.getAtmosphere()
  if (!(atmosphereContext instanceof AtmosphereContext)) {
    throw new Error(
      'getAtmosphere() must return an instanceof AtmosphereContext.'
    )
  }
  return atmosphereContext
}
