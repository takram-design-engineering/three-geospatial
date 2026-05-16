import {
  add,
  Fn,
  If,
  mix,
  positionGeometry,
  positionView,
  remapClamp,
  screenCoordinate,
  vec2,
  vec3,
  vec4,
  viewportDepthTexture,
  viewportSharedTexture,
  viewportUV
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  depthToViewZ,
  hashValues,
  inverseProjectionMatrix,
  projectionMatrix,
  rayEllipsoidIntersection,
  screenToPositionView,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import { getIndirectLuminanceToPoint, getSplitIlluminance } from './runtime'
import { sky, skyBackdrop, type SkyNode } from './SkyNode'

const CAMERA = 'CAMERA'
const BACKDROP = 'BACKDROP'

type AerialPerspectiveNodeScope = typeof CAMERA | typeof BACKDROP

export class AerialPerspectiveNode extends TempNode {
  static override get type(): string {
    return 'AerialPerspectiveNode'
  }

  private readonly scope: AerialPerspectiveNodeScope

  colorNode: Node<'vec4'>
  depthNode: TextureNode
  shadowLengthNode: Node<'vec2'> | null
  skyNode: SkyNode | null = null
  normalNode: Node<'vec3'> | null = null

  cameraPositionUnit: Node<'vec3'> | null = null
  rayDirectionECEF: Node<'vec3'> | null = null

  correctGeometricError = true
  lighting = false
  transmittance = true
  inscattering = true
  moonScattering = false

  constructor(
    scope: AerialPerspectiveNodeScope,
    colorNode: Node<'vec4'>,
    depthNode: TextureNode,
    shadowLengthNode: Node<'vec2'> | null = null
  ) {
    super('vec4')
    this.scope = scope
    this.colorNode = colorNode
    this.depthNode = depthNode
    this.shadowLengthNode = shadowLengthNode
  }

  override customCacheKey(): number {
    return hashValues(
      this.correctGeometricError,
      this.lighting,
      this.transmittance,
      this.inscattering,
      this.moonScattering
    )
  }

  override setup(builder: NodeBuilder): unknown {
    const atmosphereContext = getAtmosphereContext(builder)

    const { worldToUnit } = atmosphereContext.parameters
    const {
      camera,
      ellipsoid,
      matrixViewToECEF,
      sunDirectionECEF,
      moonDirectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit
    } = atmosphereContext

    const { colorNode, depthNode, normalNode, shadowLengthNode, skyNode } = this
    const depth = depthNode.load(screenCoordinate).r.toConst()

    const getCameraPositionUnit = (): Node<'vec3'> => {
      if (this.scope === BACKDROP) {
        // Move the camera onto the backdrop surface:
        return matrixViewToECEF
          .mul(vec4(positionView, 1))
          .xyz.mul(worldToUnit)
          .toVarying('cameraPositionUnit')
      }
      return cameraPositionUnit
    }

    const getRayDirectionECEF = (): Node<'vec3'> => {
      switch (this.scope) {
        case CAMERA: {
          const positionView = inverseProjectionMatrix(camera).mul(
            vec4(positionGeometry, 1)
          ).xyz
          return matrixViewToECEF
            .mul(vec4(positionView, 0))
            .xyz.toVarying('rayDirectionECEF')
            .normalize()
        }
        case BACKDROP: {
          return matrixViewToECEF
            .mul(vec4(positionView, 0))
            .xyz.toVarying('rayDirectionECEF')
            .normalize()
        }
      }
    }

    const getSurfacePositionUnit = (): Node<'vec3'> => {
      const viewZ = depthToViewZ(depth, camera)
      const positionView = screenToPositionView(
        // TODO: Investigate why screenUV becomes incorrect.
        viewportUV,
        depth,
        viewZ,
        projectionMatrix(camera),
        inverseProjectionMatrix(camera)
      )
      return matrixViewToECEF.mul(vec4(positionView, 1)).xyz.mul(worldToUnit)
    }

    const surfaceLuminance = Fn(() => {
      let { cameraPositionUnit, rayDirectionECEF } = this
      cameraPositionUnit ??= getCameraPositionUnit().toConst()
      rayDirectionECEF ??= getRayDirectionECEF().toConst()

      if (skyNode != null) {
        // Share the varyings with the sky node:
        skyNode.cameraPositionUnit = cameraPositionUnit
        skyNode.rayDirectionECEF = rayDirectionECEF
      }

      const positionUnit = getSurfacePositionUnit().toVar()

      // Changed our strategy on the geometric error correction, because we no
      // longer have LightingMask to exclude objects in space.
      const geometryCorrectionAmount = remapClamp(
        positionUnit.distance(cameraPositionUnit),
        // The distance to the horizon from the highest point on the earth,
        worldToUnit * 336_000,
        // The distance to the horizon at the top atmosphere
        worldToUnit * 876_000
      )

      // Geometry normal can be trivially corrected:
      const radiiUnit = vec3(ellipsoid.radii).mul(worldToUnit).toConst()
      const normalCorrected = positionUnit
        .div(radiiUnit.pow2())
        .normalize()
        .toConst()

      if (this.correctGeometricError) {
        const intersection = rayEllipsoidIntersection(
          cameraPositionUnit,
          rayDirectionECEF,
          radiiUnit
        ).x.toConst() // Near side

        const positionCorrected = intersection.greaterThanEqual(0).select(
          rayDirectionECEF.mul(intersection).add(cameraPositionUnit),
          // Fallback to radial projection:
          normalCorrected.mul(radiiUnit)
        )
        positionUnit.assign(
          mix(positionUnit, positionCorrected, geometryCorrectionAmount)
        )
      }

      // Used only when `lighting` is enabled. Undefined in the backdrop.
      const illuminance = Fn(() => {
        // Normal vector of the surface:
        let normalECEF
        if (normalNode != null) {
          normalECEF = matrixViewToECEF.mul(vec4(normalNode.xyz, 0)).xyz
          if (this.correctGeometricError) {
            normalECEF.assign(
              mix(normalECEF, normalCorrected, geometryCorrectionAmount)
            )
          }
        } else {
          normalECEF = positionUnit.normalize()
        }
        normalECEF = normalECEF.toConst()

        // Direct and indirect illuminance on the surface:
        const solarIlluminance = getSplitIlluminance(
          positionUnit.add(altitudeCorrectionUnit),
          normalECEF,
          sunDirectionECEF
        ).toConst()
        let illuminance = add(
          solarIlluminance.get('direct'),
          solarIlluminance.get('indirect')
        )
        if (this.moonScattering) {
          const lunarIlluminance = getSplitIlluminance(
            positionUnit.add(altitudeCorrectionUnit),
            normalECEF,
            moonDirectionECEF
          ).toConst()
          illuminance = add(
            illuminance,
            lunarIlluminance.get('direct'),
            lunarIlluminance.get('indirect')
          )
        }
        return illuminance
      })()

      const luminance = this.lighting
        ? colorNode.rgb.mul(illuminance).mul(1 / Math.PI) // Lambertian
        : colorNode.rgb

      const solarLuminanceTransfer = getIndirectLuminanceToPoint(
        cameraPositionUnit.add(altitudeCorrectionUnit),
        positionUnit.add(altitudeCorrectionUnit),
        shadowLengthNode ?? vec2(0),
        sunDirectionECEF
      ).toConst()
      const transmittance = solarLuminanceTransfer.get('transmittance')
      let inscattering = solarLuminanceTransfer.get('luminance')

      if (this.moonScattering) {
        // TODO: Combine the raymarch when raymarchScattering is enabled.
        const lunarLuminanceTransfer = getIndirectLuminanceToPoint(
          cameraPositionUnit.add(altitudeCorrectionUnit),
          positionUnit.add(altitudeCorrectionUnit),
          shadowLengthNode ?? vec2(0),
          moonDirectionECEF
        ).toConst()

        // TODO: Consider moon phase
        inscattering = inscattering.add(
          lunarLuminanceTransfer.get('luminance').mul(2.5e-6)
        )
      }

      let output = luminance
      if (this.transmittance) {
        output = output.mul(transmittance)
      }
      if (this.inscattering) {
        output = output.add(inscattering)
      }
      return output
    })()

    return Fn(() => {
      const luminance = colorNode.toVar()
      If(
        builder.renderer.reversedDepthBuffer
          ? depth.lessThanEqual(0)
          : depth.greaterThanEqual(1),
        () => {
          if (skyNode != null) {
            skyNode.inputNode = colorNode
            luminance.rgb.assign(skyNode)
          }
        }
      ).Else(() => {
        luminance.rgb.assign(surfaceLuminance)
      })
      return luminance
    })()
  }

  /** @deprecated Use inscattering instead. */
  get inscatter(): boolean {
    return this.inscattering
  }

  /** @deprecated Use inscattering instead. */
  set inscatter(value: boolean) {
    this.inscattering = value
  }
}

export const aerialPerspective = (
  colorNode: Node<'vec4'>,
  depthNode: TextureNode,
  shadowLengthNode?: Node<'vec2'> | null
): AerialPerspectiveNode => {
  const node = new AerialPerspectiveNode(
    CAMERA,
    colorNode,
    depthNode,
    shadowLengthNode
  )
  node.skyNode = sky(shadowLengthNode)
  return node
}

export const aerialPerspectiveBackdrop = (
  shadowLengthNode?: Node<'vec2'> | null
): AerialPerspectiveNode => {
  const node = new AerialPerspectiveNode(
    BACKDROP,
    viewportSharedTexture(),
    viewportDepthTexture()
  )
  node.skyNode = skyBackdrop(shadowLengthNode)
  return node
}
