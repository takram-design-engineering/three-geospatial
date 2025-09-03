import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { Discard, Fn, If, nodeObject, PI, uv, vec3, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  inverseProjectionMatrix,
  inverseViewMatrix,
  projectionMatrix,
  screenToPositionView,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereContextNode } from './AtmosphereContextNode'
import { getSkyLuminanceToPoint, getSunAndSkyIlluminance } from './runtime'
import { sky } from './SkyNode'

export class AerialPerspectiveNode extends TempNode {
  static override get type(): string {
    return 'AerialPerspectiveNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  colorNode: Node<'vec3' | 'vec4'>
  depthNode: Node<'float'>
  normalNode?: Node<'vec3'> | null
  skyNode?: Node<'vec3'> | null
  shadowLengthNode?: Node<'float'> | null

  // Static options:
  correctGeometricError = true
  lighting = false
  transmittance = true
  inscatter = true

  constructor(
    atmosphereContext: AtmosphereContextNode,
    colorNode: Node<'vec3' | 'vec4'>,
    depthNode: Node<'float'>,
    normalNode?: Node<'vec3'> | null
  ) {
    super('vec4')
    this.atmosphereContext = atmosphereContext
    this.colorNode = colorNode
    this.depthNode = depthNode
    this.normalNode = normalNode
    this.skyNode = sky(atmosphereContext)

    this.lighting = normalNode != null
  }

  override customCacheKey(): number {
    return hash(
      +this.correctGeometricError,
      +this.lighting,
      +this.transmittance,
      +this.inscatter
    )
  }

  override setup(builder: NodeBuilder): unknown {
    builder.getContext().atmosphere = this.atmosphereContext

    const { parameters, camera } = this.atmosphereContext
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF,
      cameraPositionUnit
    } = this.atmosphereContext.getNodes()

    const { worldToUnit } = parameters.getNodes()

    const colorNode = nodeObject(this.colorNode)
    const depthNode = nodeObject(this.depthNode)
    const depth = depthNode.r.toVar()

    const surfaceLuminance = Fn(() => {
      // Position of the surface
      const viewZ = depthToViewZ(depth, cameraNear(camera), cameraFar(camera), {
        perspective: camera.isPerspectiveCamera,
        logarithmic: builder.renderer.logarithmicDepthBuffer
      })
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

      const indirect = Fn(() => {
        if (this.normalNode == null) {
          throw new Error(
            'The "normalNode" is required when the "light" is set.'
          )
        }

        // Normal vector of the surface
        const normalNode = nodeObject(this.normalNode)
        const normalView = normalNode.xyz
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
        ? colorNode.rgb.mul(indirect())
        : colorNode.rgb

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
    this.skyNode?.dispose() // TODO: Conditionally depending on the owner.
    super.dispose()
  }
}

export const aerialPerspective = (
  ...args: ConstructorParameters<typeof AerialPerspectiveNode>
): NodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...args))
