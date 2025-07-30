import { Matrix4, Vector3, type Camera, type Vector4 } from 'three'
import {
  Fn,
  If,
  nodeObject,
  NodeUpdateType,
  PI,
  positionGeometry,
  screenUV,
  uniform,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import {
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformNode
} from 'three/webgpu'

import { Ellipsoid } from '@takram/three-geospatial'
import {
  depthToViewZ,
  needsUpdate,
  screenToView,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import {
  getSkyLuminance,
  getSkyLuminanceToPoint,
  getSunAndSkyIlluminance
} from './runtime'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
    near?: number
    far?: number
  }
}

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

function uniformUpdate<T>(
  value: T,
  callback: (self: ShaderNodeObject<UniformNode<T>>) => void
): ShaderNodeObject<UniformNode<T>> {
  return uniform(value).onRenderUpdate((_, self) => {
    callback(self)
  })
}

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

  // Optional dependencies
  @needsUpdate sunDirectionNode: Node<Vector3> = vec3()

  // Static options
  @needsUpdate ellipsoid = Ellipsoid.WGS84
  @needsUpdate correctAltitude = true
  @needsUpdate correctGeometricError = true
  @needsUpdate sunLight = true
  @needsUpdate skyLight = true
  @needsUpdate transmittance = true
  @needsUpdate inscatter = true
  @needsUpdate sky = true
  @needsUpdate sun = true
  @needsUpdate moon = true
  @needsUpdate ground = true

  // Parameters
  worldToECEFMatrix = new Matrix4().identity()

  private readonly uniforms = {
    projectionMatrix: uniformUpdate(new Matrix4(), self => {
      self.value.copy(this.camera.projectionMatrix)
    }),
    inverseProjectionMatrix: uniformUpdate(new Matrix4(), self => {
      self.value.copy(this.camera.projectionMatrixInverse)
    }),
    inverseViewMatrix: uniformUpdate(new Matrix4(), self => {
      self.value.copy(this.camera.matrixWorld)
    }),
    worldToECEFMatrix: uniformUpdate(new Matrix4(), self => {
      self.value.copy(this.worldToECEFMatrix)
    }),
    cameraNear: uniformUpdate(0, self => {
      self.value = this.camera.near ?? 0
    }),
    cameraFar: uniformUpdate(0, self => {
      self.value = this.camera.far ?? 0
    }),
    cameraPositionECEF: uniform(new Vector3()),
    altitudeCorrectionECEF: uniform(new Vector3())
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
    const { cameraPositionECEF, altitudeCorrectionECEF } = this.uniforms

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

  setup(builder: NodeBuilder): Node<Vector4> {
    const {
      projectionMatrix,
      inverseProjectionMatrix,
      inverseViewMatrix,
      worldToECEFMatrix,
      cameraNear,
      cameraFar,
      cameraPositionECEF,
      altitudeCorrectionECEF
    } = this.uniforms

    const { worldToUnit } = this.lutNode.parameters.getUniform()

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
        this.sunDirectionNode
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
      const positionView = screenToView(
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
      const sunSkyLuminance = getSunAndSkyIlluminance(
        this.lutNode,
        positionUnit,
        normalECEF,
        this.sunDirectionNode
      ).toVar()
      const sunIlluminance = sunSkyLuminance.get('sunIlluminance')
      const skyIlluminance = sunSkyLuminance.get('skyIlluminance')

      // Lambertian diffuse
      const color = this.colorNode.sample(screenUV)
      const diffuse = color.rgb.div(PI).mul(sunIlluminance.add(skyIlluminance))

      // Scattering between the camera to the surface
      const luminanceTransfer = getSkyLuminanceToPoint(
        this.lutNode,
        cameraPositionUnit,
        positionUnit,
        0, // TODO: Shadow length
        this.sunDirectionNode
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
): ShaderNodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...params))
