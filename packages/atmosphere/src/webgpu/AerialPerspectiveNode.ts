import { Discard, Fn, If, nodeObject, PI, uv, vec3, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  Fnv,
  inverseProjectionMatrix,
  inverseViewMatrix,
  projectionMatrix,
  screenToPositionView,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import { getSkyLuminanceToPoint, getSunAndSkyIlluminance } from './runtime'
import { sky } from './SkyNode'

export class AerialPerspectiveNode extends TempNode {
  static override get type(): string {
    return 'AerialPerspectiveNode'
  }

  renderingContext: AtmosphereRenderingContext
  colorNode: NodeObject<TextureNode>
  depthNode: NodeObject<TextureNode>
  normalNode?: NodeObject<TextureNode> | null
  lutNode: AtmosphereLUTNode
  skyNode: NodeObject<'vec3'>

  // Static options
  correctGeometricError = true
  lighting = false
  transmittance = true
  inscatter = true

  constructor(
    renderingContext: AtmosphereRenderingContext,
    colorNode: NodeObject<TextureNode>,
    depthNode: NodeObject<TextureNode>,
    normalNode: NodeObject<TextureNode> | null | undefined,
    lutNode: AtmosphereLUTNode
  ) {
    super('vec4')
    this.renderingContext = renderingContext
    this.colorNode = colorNode
    this.normalNode = normalNode
    this.depthNode = depthNode
    this.lutNode = lutNode
    this.skyNode = sky(renderingContext, lutNode)
  }

  override setup(builder: NodeBuilder): Node<'vec4'> {
    const { camera } = this.renderingContext
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF,
      cameraPositionUnit
    } = this.renderingContext.getNodes()

    const { worldToUnit } = this.lutNode.parameters.getNodes()

    const colorUV = this.colorNode.uvNode ?? uv()
    const depth = this.depthNode.sample(colorUV).r.toVar()

    const surfaceLuminance = Fn(() => {
      // Position of the surface
      const viewZ = depthToViewZ(
        depth,
        cameraNear(camera),
        cameraFar(camera),
        camera.isPerspectiveCamera,
        builder.renderer.logarithmicDepthBuffer
      )
      const positionView = screenToPositionView(
        colorUV,
        depth,
        viewZ,
        projectionMatrix(camera),
        inverseProjectionMatrix(camera)
      )
      const positionWorld = inverseViewMatrix(camera).mul(
        vec4(positionView, 1)
      ).xyz
      let positionECEF = worldToECEFMatrix.mul(vec4(positionWorld, 1)).xyz
      if (this.renderingContext.correctAltitude) {
        positionECEF = positionECEF.add(altitudeCorrectionECEF)
      }
      const positionUnit = positionECEF.mul(worldToUnit).toVar()

      const indirect = Fnv((): Node<'vec3'> => {
        if (this.normalNode == null) {
          throw new Error(
            'The "normalNode" is required when the "light" is set.'
          )
        }
        // Normal vector of the surface
        const normalView = this.normalNode.sample(colorUV).xyz
        const normalWorld = inverseViewMatrix(camera).mul(
          vec4(normalView, 0)
        ).xyz
        const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz

        // Direct and indirect illuminance on the surface
        const sunSkyIlluminance = getSunAndSkyIlluminance(
          this.lutNode,
          positionUnit,
          normalECEF,
          sunDirectionECEF
        ).toVar()
        const sunIlluminance = sunSkyIlluminance.get('sunIlluminance')
        const skyIlluminance = sunSkyIlluminance.get('skyIlluminance')
        return PI.reciprocal().mul(sunIlluminance.add(skyIlluminance))
      })

      const diffuse = this.lighting
        ? this.colorNode.sample(colorUV).rgb.mul(indirect())
        : this.colorNode.sample(colorUV).rgb

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

    If(depth.greaterThanEqual(1 - 1e-8), () => {
      if (this.skyNode != null) {
        // Render the sky (the scattering seen from the camera to an infinite
        // distance) for very far depths.
        outLuminance.rgb.assign(this.skyNode)
      } else {
        Discard()
      }
    }).Else(() => {
      outLuminance.rgb.assign(surfaceLuminance)
    })

    return vec4(outLuminance, 1)
  }
}

export const aerialPerspective = (
  ...args: ConstructorParameters<typeof AerialPerspectiveNode>
): NodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...args))
