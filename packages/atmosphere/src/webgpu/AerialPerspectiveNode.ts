import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { Discard, Fn, If, nodeObject, PI, uv, vec3, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  FnVar,
  inverseProjectionMatrix,
  inverseViewMatrix,
  projectionMatrix,
  screenToPositionView,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereContext } from './AtmosphereContext'
import { getSkyLuminanceToPoint, getSunAndSkyIlluminance } from './runtime'
import { sky } from './SkyNode'

export class AerialPerspectiveNode extends TempNode {
  static override get type(): string {
    return 'AerialPerspectiveNode'
  }

  private readonly atmosphereContext: AtmosphereContext

  colorNode: NodeObject | NodeObject<TextureNode>
  depthNode: NodeObject | NodeObject<TextureNode>
  normalNode?: NodeObject | NodeObject<TextureNode> | null
  skyNode?: NodeObject | null
  shadowLengthNode?: NodeObject | null

  // Static options:
  correctGeometricError = true
  lighting = false
  transmittance = true
  inscatter = true

  constructor(
    atmosphereContext: AtmosphereContext,
    colorNode: NodeObject | NodeObject<TextureNode>,
    depthNode: NodeObject | NodeObject<TextureNode>,
    normalNode?: NodeObject | NodeObject<TextureNode> | null
  ) {
    super('vec4')
    this.atmosphereContext = atmosphereContext
    this.colorNode = colorNode
    this.normalNode = normalNode
    this.depthNode = depthNode
    this.skyNode = sky(atmosphereContext)

    this.lighting = normalNode != null
  }

  override customCacheKey(): number {
    return hash(
      this.normalNode?.getCacheKey() ?? 0,
      this.skyNode?.getCacheKey() ?? 0,
      +this.correctGeometricError,
      +this.lighting,
      +this.transmittance,
      +this.inscatter
    )
  }

  override setup(builder: NodeBuilder): Node<'vec4'> {
    builder.getContext().atmosphere = this.atmosphereContext

    const { parameters, camera } = this.atmosphereContext
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF,
      cameraPositionUnit
    } = this.atmosphereContext.getNodes()

    const { worldToUnit } = parameters.getNodes()

    const depth = this.depthNode.r.toVar()

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
        uv(),
        depth,
        viewZ,
        projectionMatrix(camera),
        inverseProjectionMatrix(camera)
      )
      const positionWorld = inverseViewMatrix(camera).mul(
        vec4(positionView, 1)
      ).xyz
      let positionECEF = worldToECEFMatrix.mul(vec4(positionWorld, 1)).xyz
      if (this.atmosphereContext.correctAltitude) {
        positionECEF = positionECEF.add(altitudeCorrectionECEF)
      }
      const positionUnit = positionECEF.mul(worldToUnit).toVar()

      const indirect = FnVar((): Node<'vec3'> => {
        if (this.normalNode == null) {
          throw new Error(
            'The "normalNode" is required when the "light" is set.'
          )
        }
        // Normal vector of the surface
        const normalView = this.normalNode.xyz
        const normalWorld = inverseViewMatrix(camera).mul(
          vec4(normalView, 0)
        ).xyz
        const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz

        // Direct and indirect illuminance on the surface
        const sunSkyIlluminance = getSunAndSkyIlluminance(
          positionUnit,
          normalECEF,
          sunDirectionECEF
        )
        const sunIlluminance = sunSkyIlluminance.get('sunIlluminance')
        const skyIlluminance = sunSkyIlluminance.get('skyIlluminance')
        return sunIlluminance.add(skyIlluminance).div(PI)
      })

      const diffuse = this.lighting
        ? this.colorNode.rgb.mul(indirect())
        : this.colorNode.rgb

      // Scattering between the camera to the surface
      const luminanceTransfer = getSkyLuminanceToPoint(
        cameraPositionUnit,
        positionUnit,
        this.shadowLengthNode ?? 0,
        sunDirectionECEF
      ).toVar()
      const inscatter = luminanceTransfer.get('luminance')
      const transmittance = luminanceTransfer.get('transmittance')

      let output = diffuse
      if (this.transmittance) {
        output = output.mul(transmittance)
      }
      if (this.inscatter) {
        output = output.add(inscatter)
      }
      return output
    })().context(builder.getContext())

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

  override dispose(): void {
    super.dispose()
    this.skyNode?.dispose() // TODO: Conditionally depending on the owner.
  }
}

export const aerialPerspective = (
  ...args: ConstructorParameters<typeof AerialPerspectiveNode>
): NodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...args))
