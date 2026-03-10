import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  Fn,
  If,
  mix,
  positionGeometry,
  remapClamp,
  select,
  uv,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import {
  cameraFar,
  cameraNear,
  depthToViewZ,
  inverseProjectionMatrix,
  inverseViewMatrix,
  projectionMatrix,
  rayEllipsoidIntersection,
  screenToPositionView,
  type Node
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereContextNode } from './AtmosphereContextNode'
import { getSkyLuminanceToPoint, getSunAndSkyIlluminance } from './runtime'
import { sky } from './SkyNode'

export class AerialPerspectiveNode extends TempNode {
  static override get type(): string {
    return 'AerialPerspectiveNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  colorNode: Node<'vec4'>
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
    colorNode: Node<'vec4'>,
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
    const camera = this.atmosphereContext.camera ?? builder.camera
    if (camera == null) {
      return
    }

    builder.getContext().atmosphere = this.atmosphereContext

    const {
      ellipsoid,
      worldToUnit,
      matrixWorldToECEF,
      sunDirectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit
    } = this.atmosphereContext

    const { colorNode, depthNode, normalNode } = this
    const depth = depthNode.r.toVar()

    const getSurfacePositionECEF = (): Node<'vec3'> => {
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
      return matrixWorldToECEF.mul(vec4(positionWorld, 1)).xyz
    }

    const getRayDirectionECEF = (): Node<'vec3'> => {
      const positionView = inverseProjectionMatrix(camera).mul(
        vec4(positionGeometry, 1)
      ).xyz
      const directionWorld = inverseViewMatrix(camera).mul(
        vec4(positionView, 0)
      ).xyz
      const directionECEF = matrixWorldToECEF.mul(vec4(directionWorld, 0)).xyz
      return directionECEF.toVertexStage().normalize()
    }

    const surfaceLuminance = Fn(() => {
      const positionUnit = getSurfacePositionECEF().mul(worldToUnit).toVar()

      // Changed our strategy on the geometric error correction, because we no
      // longer have LightingMask to exclude objects in space.
      const geometryCorrectionAmount = remapClamp(
        positionUnit.distance(cameraPositionUnit),
        // The distance to the horizon from the highest point on the earth,
        worldToUnit.mul(336_000),
        // The distance to the horizon at the top atmosphere
        worldToUnit.mul(876_000)
      )

      // Geometry normal can be trivially corrected:
      const radiiUnit = vec3(ellipsoid.radii).mul(worldToUnit)
      const normalCorrected = positionUnit.div(radiiUnit.pow2()).normalize()

      if (this.correctGeometricError) {
        const rayDirectionECEF = getRayDirectionECEF()
        const intersection = rayEllipsoidIntersection(
          cameraPositionUnit,
          rayDirectionECEF,
          radiiUnit
        ).x // Near side

        const positionCorrected = select(
          intersection.greaterThanEqual(0),
          rayDirectionECEF.mul(intersection).add(cameraPositionUnit),
          // Fallback to radial projection:
          normalCorrected.mul(radiiUnit)
        )
        positionUnit.assign(
          mix(positionUnit, positionCorrected, geometryCorrectionAmount)
        )
      }

      const illuminance = Fn(() => {
        // Normal vector of the surface:
        let normalECEF
        if (normalNode != null) {
          const normalView = normalNode.xyz
          const normalWorld = inverseViewMatrix(camera).mul(
            vec4(normalView, 0)
          ).xyz
          normalECEF = matrixWorldToECEF.mul(vec4(normalWorld, 0)).xyz

          if (this.correctGeometricError) {
            normalECEF.assign(
              mix(normalECEF, normalCorrected, geometryCorrectionAmount)
            )
          }
        } else {
          normalECEF = positionUnit.normalize()
        }

        // Direct and indirect illuminance on the surface:
        const sunSkyIlluminance = getSunAndSkyIlluminance(
          positionUnit.add(altitudeCorrectionUnit),
          normalECEF,
          sunDirectionECEF
        )
        const sunIlluminance = sunSkyIlluminance.get('sunIlluminance')
        const skyIlluminance = sunSkyIlluminance.get('skyIlluminance')
        return sunIlluminance.add(skyIlluminance)
      })()

      const diffuse = this.lighting
        ? colorNode.rgb.mul(illuminance).mul(1 / Math.PI) // Lambertian
        : colorNode.rgb

      // Scattering between the camera to the surface:
      const luminanceTransfer = getSkyLuminanceToPoint(
        cameraPositionUnit.add(altitudeCorrectionUnit),
        positionUnit.add(altitudeCorrectionUnit),
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

    return Fn(() => {
      const luminance = colorNode.toVar()
      If(depth.greaterThanEqual(1), () => {
        if (this.skyNode != null) {
          // Render the sky (the scattering seen from the camera to an infinite
          // distance) for very far depths.
          luminance.rgb.assign(this.skyNode)
        }
      }).Else(() => {
        luminance.rgb.assign(surfaceLuminance)
      })
      return luminance
    })()
  }

  override dispose(): void {
    this.skyNode?.dispose() // TODO: Conditionally depending on the owner.
    super.dispose()
  }
}

export const aerialPerspective = (
  ...args: ConstructorParameters<typeof AerialPerspectiveNode>
): AerialPerspectiveNode => new AerialPerspectiveNode(...args)
