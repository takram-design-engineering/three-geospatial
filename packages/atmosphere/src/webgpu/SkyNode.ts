import type { Camera } from 'three'
import {
  acos,
  cos,
  dFdx,
  dFdy,
  If,
  max,
  nodeProxy,
  PI,
  positionGeometry,
  select,
  sin,
  smoothstep,
  sqrt,
  uv,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import {
  Fnv,
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
import type { Luminance3 } from './dimensional'
import { getSkyLuminance, getSolarLuminance } from './runtime'

declare module 'three/webgpu' {
  interface NodeBuilder {
    camera?: Camera
  }
}

const cameraDirectionWorld = /*#__PURE__*/ Fnv((camera: Camera) => {
  const positionView = inverseProjectionMatrix(camera).mul(
    vec4(positionGeometry, 1)
  ).xyz
  const directionWorld = inverseViewMatrix(camera).mul(
    vec4(positionView, 0)
  ).xyz
  return directionWorld
})

const equirectangularWorld = /*#__PURE__*/ Fnv(
  (equirectUV: NodeObject<'vec2'>) => {
    const theta = equirectUV.y.oneMinus().mul(PI).toVar()
    const phi = equirectUV.x.oneMinus().mul(2, PI).toVar()
    const sinTheta = sin(theta).toVar()
    return vec3(sinTheta.mul(sin(phi)), cos(theta), sinTheta.mul(cos(phi)))
  }
)

const getLunarRadiance = /*#__PURE__*/ Fnv(
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

const intersectSphere = /*#__PURE__*/ Fnv(
  (
    rayDirection: NodeObject<'vec3'>,
    directionToCenter: NodeObject<'vec3'>,
    angularRadius: NodeObject<'float'>
  ): NodeObject<'vec3'> => {
    const p = directionToCenter.negate().toVar()
    const cosPRay = p.dot(rayDirection).toVar()
    const discriminant = p.dot(p).sub(angularRadius.pow2())
    return cosPRay.negate().sub(sqrt(cosPRay.pow2().sub(discriminant)))
  }
)

// Oren-Nayar diffuse of roughness = 1 and albedo = 1:
// Reference: https://mimosa-pudica.net/improved-oren-nayar.html
const orenNayarDiffuse = /*#__PURE__*/ Fnv(
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

const SCREEN = 'POST_PROCESSING'
const WORLD = 'RENDERER'
const EQUIRECTANGULAR = 'EQUIRECTANGULAR'

type SkyNodeScope = typeof SCREEN | typeof WORLD | typeof EQUIRECTANGULAR

export interface SkyNodeOptions {
  showSun?: boolean
  showMoon?: boolean
  showGround?: boolean
  useContextCamera?: boolean
}

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  renderingContext: AtmosphereRenderingContext
  lutNode: AtmosphereLUTNode

  @nodeType('float')
  moonAngularRadius = 0.0045 // ≈ 15.5 arcminutes

  // Static options
  showSun = true
  showMoon = true
  showGround = true

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

  private readonly setupSunMoon = Fnv(
    (
      parameters: AtmosphereParametersNodes,
      rayDirectionECEF: NodeObject<'vec3'>,
      sunDirectionECEF: NodeObject<'vec3'>,
      moonDirectionECEF: NodeObject<'vec3'>,
      moonAngularRadius: NodeObject<'float'>
    ): Node<'vec3'> => {
      const sunLuminance = vec3(0).toVar()
      const moonLuminance = vec3(0).toVar()

      if (this.showSun || this.showMoon) {
        const ddx = dFdx(rayDirectionECEF)
        const ddy = dFdy(rayDirectionECEF)
        const fragmentAngle = ddx.distance(ddy).div(rayDirectionECEF.length())

        if (this.showSun) {
          const { sunAngularRadius } = parameters
          const cosViewSun = rayDirectionECEF.dot(sunDirectionECEF).toVar()
          If(cosViewSun.greaterThan(cos(sunAngularRadius)), () => {
            const angle = acos(cosViewSun.clamp(-1, 1))
            const antialias = smoothstep(
              sunAngularRadius,
              sunAngularRadius.sub(fragmentAngle),
              angle
            )
            sunLuminance.assign(getSolarLuminance(parameters).mul(antialias))
          })
        }

        if (this.showMoon) {
          const intersection = intersectSphere(
            rayDirectionECEF,
            moonDirectionECEF,
            moonAngularRadius
          )
          If(intersection.greaterThan(0), () => {
            const normal = moonDirectionECEF
              .sub(rayDirectionECEF.mul(intersection))
              .normalize()
            const diffuse = orenNayarDiffuse(
              sunDirectionECEF.negate(),
              rayDirectionECEF,
              normal
            )
            const cosViewMoon = rayDirectionECEF.dot(moonDirectionECEF)
            const angle = acos(cosViewMoon.clamp(-1, 1))
            const antialias = smoothstep(
              moonAngularRadius,
              moonAngularRadius.sub(fragmentAngle),
              angle
            )
            moonLuminance.assign(
              getLunarRadiance(parameters, moonAngularRadius)
                .mul(diffuse)
                .mul(antialias)
            )
          })
        }
      }
      return sunLuminance.add(moonLuminance)
    }
  )

  override setup(builder: NodeBuilder): Node<'vec3'> {
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      moonDirectionECEF,
      cameraPositionUnit
    } = this.renderingContext.getNodes()

    const parameters = this.renderingContext.parameters.getNodes()

    const reference = referenceTo<SkyNode>(this)
    const moonAngularRadius = reference('moonAngularRadius')

    // Direction of the camera ray:
    const rayDirectionECEF = Fnv(() => builder => {
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
          directionWorld = equirectangularWorld(uv())
          break
      }
      return worldToECEFMatrix.mul(vec4(directionWorld, 0)).xyz
    })()
      .toVertexStage()
      .normalize()

    const luminanceTransfer = getSkyLuminance(
      parameters,
      this.lutNode,
      cameraPositionUnit,
      rayDirectionECEF,
      0, // TODO: Shadow length
      sunDirectionECEF,
      { showGround: this.showGround }
    )
    const inscatter = luminanceTransfer.get('luminance')
    const transmittance = luminanceTransfer.get('transmittance')

    const sunMoonLuminance = this.setupSunMoon(
      parameters,
      rayDirectionECEF,
      sunDirectionECEF,
      moonDirectionECEF,
      moonAngularRadius
    )
    return inscatter.add(sunMoonLuminance.mul(transmittance))
  }
}

export const sky = nodeProxy(SkyNode, SCREEN)
export const skyWorld = nodeProxy(SkyNode, WORLD)
export const skyBackground = nodeProxy(SkyNode, EQUIRECTANGULAR)
