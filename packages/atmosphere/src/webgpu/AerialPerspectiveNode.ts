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
  vec2,
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
  screenToView,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParameters } from './AtmosphereParameters'
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

const worldToUnitLength = 0.001

export class AerialPerspectiveNode extends TempNode {
  static get type(): string {
    return 'AerialPerspectiveNode'
  }

  // Dependency nodes
  camera: Camera
  albedoNode: TextureNode
  depthNode: TextureNode
  normalNode: TextureNode
  lutNode: AtmosphereLUTNode

  // TODO: Options
  ellipsoid = Ellipsoid.WGS84
  correctAltitude = true
  correctGeometricError = true
  sunLight = true
  skyLight = true
  transmittance = true
  inscatter = true
  sky = true
  sun = true
  moon = true
  ground = true

  readonly atmosphere = new AtmosphereParameters()
  readonly worldToECEFMatrix = new Matrix4().identity()
  readonly sunDirection = new Vector3()

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
    cameraPositionECEF: uniform(new Vector3()),
    cameraNear: uniformUpdate(0, self => {
      self.value = this.camera.near ?? 0
    }),
    cameraFar: uniformUpdate(0, self => {
      self.value = this.camera.far ?? 0
    }),
    sunDirectionECEF: uniform(this.sunDirection),
    altitudeCorrectionECEF: uniform(new Vector3())
  }

  constructor(
    camera: Camera,
    albedoNode: TextureNode,
    depthNode: TextureNode,
    normalNode: TextureNode,
    lutNode: AtmosphereLUTNode
  ) {
    super('vec4')
    this.camera = camera
    this.albedoNode = albedoNode
    this.depthNode = depthNode
    this.normalNode = normalNode
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
      this.atmosphere.bottomRadius.value / worldToUnitLength,
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
      sunDirectionECEF,
      altitudeCorrectionECEF
    } = this.uniforms

    const cameraPositionUnit = cameraPositionECEF
      .add(altitudeCorrectionECEF)
      .mul(worldToUnitLength)
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

    const luminance = vec3().toVar()

    const depth = this.depthNode.sample(screenUV)
    If(depth.greaterThanEqual(1 - 1e-8), () => {
      // Render the sky (the scattering seen from the camera to a infinite
      // distance) for very far depths.
      const luminanceTransfer = getSkyLuminance(
        this.lutNode,
        cameraPositionUnit,
        rayDirectionECEF,
        0, // TODO: Shadow length
        sunDirectionECEF
      ).toVar()
      const inscatter = luminanceTransfer.get('luminance')
      luminance.assign(inscatter)
    }).Else(() => {
      // Normal vector of the surface
      const normalView = this.normalNode.sample(screenUV).xyz
      const normalWorld = inverseViewMatrix.mul(vec4(normalView, 0)).xyz
      const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz

      // Position of the surface
      const viewZ = depthToViewZ(this.camera, depth, cameraNear, cameraFar)
      const positionView = screenToView(
        vec2(screenUV.x, screenUV.y.oneMinus()),
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
      const positionUnit = positionECEF.mul(worldToUnitLength).toVar()

      // Direct and indirect illuminance on the surface
      const sunSkyLuminance = getSunAndSkyIlluminance(
        this.lutNode,
        positionUnit,
        normalECEF,
        sunDirectionECEF
      ).toVar()
      const sunIlluminance = sunSkyLuminance.get('sunIlluminance')
      const skyIlluminance = sunSkyLuminance.get('skyIlluminance')

      // Lambertian diffuse
      const albedo = this.albedoNode.sample(screenUV)
      const diffuse = albedo.div(PI).mul(sunIlluminance.add(skyIlluminance))

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
      luminance.assign(diffuse.mul(transmittance).add(inscatter))
    })

    return luminance
  }
}

export const aerialPerspective = (
  ...params: ConstructorParameters<typeof AerialPerspectiveNode>
): ShaderNodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...params))
