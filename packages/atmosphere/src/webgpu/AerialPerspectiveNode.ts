import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  Fn,
  If,
  mix,
  nodeObject,
  PI,
  remapClamp,
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

    const { parameters, camera, ellipsoid } = this.atmosphereContext
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF,
      cameraPositionECEF,
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

      // Changed our strategy on the geometric error correction, because we no
      // longer have LightingMask to exclude objects in space.
      const correctionAmount = remapClamp(
        positionECEF.distance(cameraPositionECEF),
        336_000, // The distance to the horizon from the highest point on the earth
        876_000 // The distance to the horizon at the top atmosphere
      )
      const sphereNormal = positionECEF
        .mul(vec3(ellipsoid.reciprocalRadiiSquared()))
        .normalize()

      const correctPositionError = (positionECEF: NodeObject<'vec3'>): void => {
        // TODO: The error is pronounced at the edge of the ellipsoid due to the
        // large difference between the sphere position and the unprojected
        // position at the current fragment. Calculating the sphere position from
        // the fragment UV may resolve this.
        const spherePosition = sphereNormal.mul(parameters.bottomRadius)
        positionECEF.assign(mix(positionECEF, spherePosition, correctionAmount))
      }

      const correctNormalError = (normalECEF: NodeObject<'vec3'>): void => {
        normalECEF.assign(mix(normalECEF, sphereNormal, correctionAmount))
      }

      if (this.correctGeometricError) {
        correctPositionError(positionECEF)
      }

      const positionUnit = positionECEF.mul(worldToUnit).toVar()

      const indirect = Fn(() => {
        if (this.normalNode == null) {
          throw new Error(
            'The "normalNode" is required when the "light" is set.'
          )
        }

        // Normal vector of the surface:
        const normalNode = nodeObject(this.normalNode)
        const normalView = normalNode.xyz
        const normalWorld = inverseViewMatrix(camera).mul(
          vec4(normalView, 0)
        ).xyz
        const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz

        if (this.correctGeometricError) {
          correctNormalError(normalECEF)
        }

        // Direct and indirect illuminance on the surface:
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

    return Fn(() => {
      const luminance = colorNode.toVar()
      If(depth.greaterThanEqual(1 - 1e-8), () => {
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
): NodeObject<AerialPerspectiveNode> =>
  nodeObject(new AerialPerspectiveNode(...args))
