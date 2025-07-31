import { Light, Matrix4, Vector3, type Camera } from 'three'
import {
  Fn,
  If,
  nodeObject,
  NodeUpdateType,
  PI,
  positionGeometry,
  reference,
  screenUV,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'

import { Ellipsoid } from '@takram/three-geospatial'
import {
  depthToViewZ,
  needsUpdate,
  NodeObject,
  nodeType,
  screenToPositionView,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import {
  getSkyLuminance,
  getSkyLuminanceToPoint,
  getSunAndSkyIlluminance
} from './runtime'

export class AerialPerspectiveNode extends TempNode {
  static get type(): string {
    return 'AerialPerspectiveNode'
  }

  // Dependencies
  @needsUpdate camera: Camera
  @needsUpdate colorNode: TextureNode
  @needsUpdate depthNode: TextureNode
  @needsUpdate normalNode: TextureNode
  @needsUpdate lutNode: AtmosphereLUTNode

  @nodeType('mat4')
  worldToECEFMatrix = new Matrix4().identity()

  @nodeType('vec3')
  sunDirectionECEF = new Vector3().copy(Light.DEFAULT_UP)

  // Static options
  @needsUpdate ellipsoid = Ellipsoid.WGS84
  @needsUpdate correctAltitude = true
  @needsUpdate correctGeometricError = true
  @needsUpdate light: 'sun' | 'sky' | boolean = true
  @needsUpdate transmittance = true
  @needsUpdate inscatter = true
  @needsUpdate sky = true
  @needsUpdate sun = true
  @needsUpdate moon = true
  @needsUpdate ground = true

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  // prettier-ignore
  private readonly _uniforms = {
    projectionMatrix: reference('camera.projectionMatrix', 'mat4', this),
    inverseProjectionMatrix: reference('camera.projectionMatrixInverse', 'mat4', this),
    inverseViewMatrix: reference('camera.matrixWorld', 'mat4', this),
    worldToECEFMatrix: reference('worldToECEFMatrix', 'mat4', this),
    cameraNear: reference('camera.near', 'float', this),
    cameraFar: reference('camera.far', 'float', this),
    cameraPositionECEF: uniform(new Vector3()),
    altitudeCorrectionECEF: uniform(new Vector3()),
    sunDirectionECEF: reference('sunDirectionECEF', 'vec3', this)
  }

  constructor(
    camera: Camera,
    colorNode: TextureNode,
    normalNode: TextureNode,
    depthNode: TextureNode,
    lutNode: AtmosphereLUTNode
  ) {
    super('vec4')
    this.camera = camera
    this.colorNode = colorNode
    this.normalNode = normalNode
    this.depthNode = depthNode
    this.lutNode = lutNode

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  updateBefore(frame: NodeFrame): void {
    const { cameraPositionECEF, altitudeCorrectionECEF } = this._uniforms

    cameraPositionECEF.value
      .setFromMatrixPosition(this.camera.matrixWorld)
      .applyMatrix4(this.worldToECEFMatrix)

    getAltitudeCorrectionOffset(
      cameraPositionECEF.value,
      this.lutNode.parameters.bottomRadius,
      this.ellipsoid,
      altitudeCorrectionECEF.value
    )
  }

  setup(builder: NodeBuilder): Node<'vec4'> {
    const {
      projectionMatrix,
      inverseProjectionMatrix,
      inverseViewMatrix,
      worldToECEFMatrix,
      cameraNear,
      cameraFar,
      cameraPositionECEF,
      altitudeCorrectionECEF,
      sunDirectionECEF
    } = this._uniforms

    const { worldToUnit } = this.lutNode.parameters.getContext()

    const cameraPositionUnit = cameraPositionECEF
      .add(altitudeCorrectionECEF)
      .mul(worldToUnit)
      .toVertexStage()

    const rayDirectionECEF = Fn(() => {
      const positionView = inverseProjectionMatrix.mul(
        vec4(positionGeometry, 1)
      ).xyz
      const directionWorld = inverseViewMatrix.mul(vec4(positionView, 0)).xyz
      const directionECEF = worldToECEFMatrix.mul(vec4(directionWorld, 0)).xyz
      return directionECEF
    })()
      .toVertexStage()
      .normalize()

    const skyLuminance = Fn(() => {
      const luminanceTransfer = getSkyLuminance(
        this.lutNode,
        cameraPositionUnit,
        rayDirectionECEF,
        0, // TODO: Shadow length
        sunDirectionECEF
      ).toVar()
      const inscatter = luminanceTransfer.get('luminance')
      return inscatter // TODO: Direct luminance
    })()

    const surfaceLuminance = Fn(() => {
      // Normal vector of the surface
      const normalView = this.normalNode.sample(screenUV).xyz
      const normalWorld = inverseViewMatrix.mul(vec4(normalView, 0)).xyz
      const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz

      // Position of the surface
      const viewZ = depthToViewZ(this.camera, depth, cameraNear, cameraFar)
      const positionView = screenToPositionView(
        screenUV,
        depth,
        viewZ,
        projectionMatrix,
        inverseProjectionMatrix
      )
      const positionWorld = inverseViewMatrix.mul(vec4(positionView, 1)).xyz
      const positionECEF = worldToECEFMatrix
        .mul(vec4(positionWorld, 1))
        .xyz.toVar()
      positionECEF.addAssign(altitudeCorrectionECEF)
      const positionUnit = positionECEF.mul(worldToUnit).toVar()

      // Direct and indirect illuminance on the surface
      const sunSkyIlluminance = getSunAndSkyIlluminance(
        this.lutNode,
        positionUnit,
        normalECEF,
        sunDirectionECEF
      ).toVar()
      const sunIlluminance = sunSkyIlluminance.get('sunIlluminance')
      const skyIlluminance = sunSkyIlluminance.get('skyIlluminance')

      // Lambertian diffuse
      const color = this.colorNode.sample(screenUV)
      const diffuse = color.rgb.div(PI).mul(sunIlluminance.add(skyIlluminance))
      // const diffuse = color.rgb

      // Scattering between the camera to the surface
      const luminanceTransfer = getSkyLuminanceToPoint(
        this.lutNode,
        cameraPositionUnit,
        positionUnit,
        0, // TODO: Shadow length
        sunDirectionECEF
      ).toVar()
      const inscatter = luminanceTransfer.get('luminance')
      const transmittance = luminanceTransfer.get('transmittance')
      return diffuse.mul(transmittance).add(inscatter)
    })()

    const outLuminance = vec3().toVar()

    const depth = this.depthNode.sample(screenUV)
    If(depth.greaterThanEqual(1 - 1e-8), () => {
      // Render the sky (the scattering seen from the camera to an infinite
      // distance) for very far depths.
      outLuminance.rgb.assign(skyLuminance)
    }).Else(() => {
      outLuminance.rgb.assign(surfaceLuminance)
    })

    return vec4(outLuminance, 1)
  }
}

export const aerialPerspective = (
  ...params: ConstructorParameters<typeof AerialPerspectiveNode>
): NodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...params))
