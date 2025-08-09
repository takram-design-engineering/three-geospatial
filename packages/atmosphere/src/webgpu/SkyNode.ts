import type { Camera } from 'three'
import {
  abs,
  acos,
  cos,
  dFdx,
  dFdy,
  equirectUV,
  fwidth,
  If,
  max,
  mix,
  nodeProxy,
  PI,
  positionGeometry,
  select,
  smoothstep,
  sqrt,
  texture,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  TempNode,
  TextureLoader,
  TextureNode,
  type NodeBuilder
} from 'three/webgpu'

import {
  equirectWorld,
  Fnv,
  inverseProjectionMatrix,
  inverseViewMatrix,
  nodeType,
  referenceTo,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { DEFAULT_MOON_TEXTURE_URL } from '../constants'
import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import { AtmosphereParametersUniforms } from './AtmosphereParameters'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'
import type { Luminance3 } from './dimensional'
import { getSkyLuminance, getSolarLuminance } from './runtime'

const cameraDirectionWorld = /*#__PURE__*/ Fnv((camera: Camera) => {
  const positionView = inverseProjectionMatrix(camera).mul(
    vec4(positionGeometry, 1)
  ).xyz
  const directionWorld = inverseViewMatrix(camera).mul(
    vec4(positionView, 0)
  ).xyz
  return directionWorld
})

const getLunarRadiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
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
    centerDirection: NodeObject<'vec3'>,
    angularRadius: NodeObject<'float'>
  ): NodeObject<'vec3'> => {
    const cosRay = centerDirection.dot(rayDirection).toVar()
    const discriminant = cosRay.pow2().sub(cos(angularRadius).pow2())
    return cosRay.sub(sqrt(discriminant))
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

const equirectGrid = /*#__PURE__*/ Fnv(
  (
    direction: NodeObject<'vec3'>,
    lineWidth: NodeObject<'float'>
  ): Node<'float'> => {
    const count = vec2(90, 45)
    const uv = equirectUV(direction)
    const deltaUV = fwidth(uv)
    const width = lineWidth.mul(deltaUV).mul(0.5)
    const distance = abs(uv.mul(count).fract().sub(0.5)).div(count)
    const mask = smoothstep(width, width.add(deltaUV), distance).oneMinus()
    return mask.x.add(mask.y).clamp(0, 1)
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
  moonTexture?: TextureNode | null

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
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      moonDirectionECEF,
      moonNorthPoleECEF,
      cameraPositionUnit
    } = this.renderingContext.getUniforms()

    const parameters = this.renderingContext.parameters.getUniforms()

    const reference = referenceTo<SkyNode>(this)
    const moonAngularRadius = reference('moonAngularRadius')
    const moonIntensity = reference('moonIntensity')

    this.moonTexture ??= texture(
      new TextureLoader().load(DEFAULT_MOON_TEXTURE_URL)
    )

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

    const sunMoonLuminance = Fnv((): Node<'vec3'> => {
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
            // Ignoring libration, the moon always faces its prime meridian to
            // the observer. Thus, we can construct an orthonormal basis,
            // provided the direction to the north pole from the moon center.
            // TODO: Maybe have a matrix uniform and construct it on the CPU?
            const centerToView = moonDirectionECEF.negate().toVar()
            const z = moonNorthPoleECEF
            const x = centerToView.sub(z.mul(centerToView.dot(z))).normalize()
            const y = z.cross(x).normalize()
            const normal = rayDirectionECEF
              .mul(intersection)
              .sub(moonDirectionECEF)
              .normalize()
              .toVar()

            const nx = normal.dot(x)
            const ny = normal.dot(y)
            const nz = normal.dot(z)
            const uv = equirectUV(vec3(nx, nz, ny)) // equirectUV() expects Y-up
            const color = this.moonTexture?.level(0).sample(uv) ?? 1

            const diffuse = orenNayarDiffuse(
              sunDirectionECEF,
              rayDirectionECEF.negate(),
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
                .mul(moonIntensity)
                .mul(color)
                .mul(diffuse)
                .mul(antialias)
            )
          })
        }
      }
      return sunLuminance.add(moonLuminance)
    })

    return inscatter.add(sunMoonLuminance().mul(transmittance))
  }
}

export const sky = nodeProxy(SkyNode, SCREEN)
export const skyWorld = nodeProxy(SkyNode, WORLD)
export const skyBackground = nodeProxy(SkyNode, EQUIRECTANGULAR)
