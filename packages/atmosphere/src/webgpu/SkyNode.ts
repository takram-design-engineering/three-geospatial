import type { Camera } from 'three'
import {
  cos,
  equirectUV,
  Fn,
  fwidth,
  If,
  mat3,
  max,
  mix,
  nodeProxy,
  PI,
  positionGeometry,
  select,
  smoothstep,
  sqrt,
  uv,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, TextureNode, type NodeBuilder } from 'three/webgpu'

import {
  equirectGrid,
  equirectWorld,
  FnVar,
  inverseProjectionMatrix,
  inverseViewMatrix,
  nodeType,
  referenceTo,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParametersNodes } from './AtmosphereParameters'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import { createAtmosphereContext } from './context'
import type { Luminance3 } from './dimensional'
import { getSkyLuminance, getSolarLuminance } from './runtime'

const mat3Columns = /*#__PURE__*/ FnVar(
  (
    c0: NodeObject<'vec3'>,
    c1: NodeObject<'vec3'>,
    c2: NodeObject<'vec3'>
  ): Node<'mat3'> => {
    return mat3(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z)
  }
)

const cameraDirectionWorld = /*#__PURE__*/ FnVar((camera: Camera) => {
  const positionView = inverseProjectionMatrix(camera).mul(
    vec4(positionGeometry, 1)
  ).xyz
  const directionWorld = inverseViewMatrix(camera).mul(
    vec4(positionView, 0)
  ).xyz
  return directionWorld
})

const getLunarRadiance = /*#__PURE__*/ FnVar(
  (
    parameters: AtmosphereParametersNodes,
    moonAngularRadius: NodeObject<'float'>
  ): Node<Luminance3> => {
    return (
      parameters.solarIrradiance
        // Visual magnitude of the sun: m1 = -26.74
        // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
        // Visual magnitude of the moon: m2 = -12.74
        // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html)
        // Relative brightness: 10^{0.4*(m2-m1)} ≈ 0.0000025
        .mul(0.0000025)
        .div(PI.mul(moonAngularRadius.pow2()))
        .mul(parameters.sunRadianceToLuminance.mul(parameters.luminanceScale))
    )
  }
)

const raySphereIntersectionNormal = /*#__PURE__*/ FnVar(
  (
    rayDirection: NodeObject<'vec3'>,
    centerDirection: NodeObject<'vec3'>,
    angularRadius: NodeObject<'float'>
  ): NodeObject<'vec3'> => {
    const cosRay = centerDirection.dot(rayDirection).toVar()
    // The vector from the centerDirection to the projection point on the ray.
    const P = centerDirection.sub(rayDirection.mul(cosRay)).negate().toVar()
    // The half chord length along the ray.
    const s = sqrt(angularRadius.pow2().sub(P.dot(P)).max(0))
    return P.sub(rayDirection.mul(s)).div(angularRadius)
  }
)

// Oren-Nayar diffuse of roughness = 1 and albedo = 1:
// Reference: https://mimosa-pudica.net/improved-oren-nayar.html
const orenNayarDiffuse = /*#__PURE__*/ FnVar(
  (
    lightDirection: NodeObject<'vec3'>,
    viewDirection: NodeObject<'vec3'>,
    normal: NodeObject<'vec3'>
  ): Node<'float'> => {
    const cosLight = normal.dot(lightDirection).toVar()
    const cosView = normal.dot(viewDirection).toVar()
    const s = lightDirection
      .dot(viewDirection)
      .sub(cosLight.mul(cosView))
      .toVar()
    const t = select(s.greaterThan(0), max(cosLight, cosView), 1)
    const A = (1 / Math.PI) * (1 - 0.5 * (1 / 1.33) + 0.17 * (1 / 1.13))
    const B = (1 / Math.PI) * (0.45 * (1 / 1.09))
    return max(0, cosLight).mul(s.div(t).mul(B).add(A))
  }
)

const SCREEN = 'SCREEN'
const WORLD = 'WORLD'
const EQUIRECTANGULAR = 'EQUIRECTANGULAR'

type SkyNodeScope = typeof SCREEN | typeof WORLD | typeof EQUIRECTANGULAR

export interface SkyNodeOptions {
  showSun?: boolean
  showMoon?: boolean
  showGround?: boolean
}

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  renderingContext: AtmosphereRenderingContext
  lutNode: AtmosphereLUTNode

  @nodeType('float') moonAngularRadius = 0.0045 // ≈ 15.5 arcminutes
  @nodeType('float') moonIntensity = 1
  moonColorTexture?: TextureNode | null
  moonNormalTexture?: TextureNode | null

  // Static options
  showSun = true
  showMoon = true
  showGround = true
  debugEquirectGrid = false

  private readonly scope: SkyNodeScope = SCREEN

  constructor(
    scope: SkyNodeScope,
    renderingContext: AtmosphereRenderingContext,
    lutNode: AtmosphereLUTNode,
    options?: SkyNodeOptions
  ) {
    super('vec3')
    this.scope = scope
    this.renderingContext = renderingContext
    this.lutNode = lutNode
    Object.assign(this, options)
  }

  override setup(builder: NodeBuilder): Node<'vec3'> {
    builder.getContext().atmosphere = createAtmosphereContext(
      this.renderingContext.parameters,
      this.renderingContext,
      this.lutNode,
      { showGround: this.showGround }
    )

    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      moonDirectionECEF,
      moonFixedToECEFMatrix,
      cameraPositionUnit
    } = this.renderingContext.getNodes()

    const parameters = this.renderingContext.parameters.getNodes()

    const reference = referenceTo<SkyNode>(this)
    const moonAngularRadius = reference('moonAngularRadius')
    const moonIntensity = reference('moonIntensity')
    const moonColorTexture = this.moonColorTexture
    const moonNormalTexture = this.moonNormalTexture

    // Direction of the camera ray:
    const rayDirectionECEF = FnVar(() => builder => {
      let directionWorld
      switch (this.scope) {
        case SCREEN:
          directionWorld = cameraDirectionWorld(this.renderingContext.camera)
          break
        case WORLD:
          directionWorld =
            builder.camera != null
              ? cameraDirectionWorld(builder.camera)
              : vec3()
          break
        case EQUIRECTANGULAR:
          directionWorld = equirectWorld(uv())
          break
      }
      return worldToECEFMatrix.mul(vec4(directionWorld, 0)).xyz
    })()
      .toVertexStage()
      .normalize()

    if (this.debugEquirectGrid) {
      return mix(vec3(1), vec3(0), equirectGrid(rayDirectionECEF, 1))
    }

    const luminanceTransfer = getSkyLuminance(
      cameraPositionUnit,
      rayDirectionECEF,
      0, // TODO: Shadow length
      sunDirectionECEF
    )
    const inscatter = luminanceTransfer.get('luminance')
    const transmittance = luminanceTransfer.get('transmittance')

    // WORKAROUND: As of r179, assign() can only be used inside "Fn".
    const luminance = Fn(() => {
      const luminance = vec3(0).toVar()

      // Compute the luminance of the sun:
      if (this.showSun) {
        const { sunAngularRadius } = parameters
        const chordThreshold = cos(sunAngularRadius).oneMinus().mul(2)
        const chordVector = rayDirectionECEF.sub(sunDirectionECEF)
        const chordLength = chordVector.dot(chordVector)
        const filterWidth = fwidth(chordLength)

        const sunLuminance = vec3().toVar()
        If(chordLength.lessThan(chordThreshold), () => {
          const antialias = smoothstep(
            chordThreshold,
            chordThreshold.sub(filterWidth),
            chordLength
          )
          sunLuminance.assign(getSolarLuminance().mul(antialias))
        })
        luminance.addAssign(sunLuminance)
      }

      // Compute the luminance of the moon:
      if (this.showMoon) {
        const chordThreshold = cos(moonAngularRadius).oneMinus().mul(2)
        const chordVector = rayDirectionECEF.sub(moonDirectionECEF)
        const chordLength = chordVector.dot(chordVector)
        const filterWidth = fwidth(chordLength)

        const moonLuminance = vec3().toVar()
        If(chordLength.lessThan(chordThreshold), () => {
          const normalECEF = raySphereIntersectionNormal(
            rayDirectionECEF,
            moonDirectionECEF,
            moonAngularRadius
          ).toVar()
          const normalMF = moonFixedToECEFMatrix
            .transpose()
            .mul(vec4(normalECEF, 0))
            .xyz.toVar()
          const uv = equirectUV(normalMF.xzy) // The equirectUV expects Y-up

          if (moonNormalTexture != null) {
            // Apply the normal texture and convert it back to the ECEF space.
            const localX = vec3(1, 0, 0).toConst()
            const localZ = vec3(0, 0, 1).toConst()
            const tangent = localZ.cross(normalMF).toVar()
            tangent.assign(
              select(
                tangent.dot(tangent).lessThan(1e-7),
                localX.cross(normalMF).normalize(),
                tangent.normalize()
              )
            )
            const bitangent = normalMF.cross(tangent).normalize()
            const normalTangent = moonNormalTexture.sample(uv).xyz.mul(2).sub(1)
            const tangentToLocal = mat3Columns(tangent, bitangent, normalMF)
            normalMF.assign(tangentToLocal.mul(normalTangent).normalize())
            normalECEF.assign(moonFixedToECEFMatrix.mul(vec4(normalMF, 0)).xyz)
          }

          const color = moonColorTexture?.sample(uv).xyz ?? 1
          const diffuse = orenNayarDiffuse(
            sunDirectionECEF,
            rayDirectionECEF.negate(),
            normalECEF
          )

          const antialias = smoothstep(
            chordThreshold,
            chordThreshold.sub(filterWidth),
            chordLength
          )
          moonLuminance.assign(
            getLunarRadiance(parameters, moonAngularRadius)
              .mul(moonIntensity)
              .mul(color)
              .mul(diffuse)
              .mul(antialias)
          )
        })
        luminance.addAssign(moonLuminance)
      }

      return luminance
    })()

    return luminance.mul(transmittance).add(inscatter)
  }
}

export const sky = nodeProxy(SkyNode, SCREEN)
export const skyWorld = nodeProxy(SkyNode, WORLD)
export const skyBackground = nodeProxy(SkyNode, EQUIRECTANGULAR)
