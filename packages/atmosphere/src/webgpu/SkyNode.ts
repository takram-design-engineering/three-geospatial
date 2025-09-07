import type { Camera } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
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
  uniform,
  uv,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import {
  equirectToDirectionWorld,
  FnLayout,
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import { AtmosphereContextNode } from './AtmosphereContextNode'
import { Luminance3 } from './dimensional'
import { getSkyLuminance, getSolarLuminance } from './runtime'

const mat3Columns = /*#__PURE__*/ FnLayout({
  name: 'mat3Columns',
  type: 'mat3',
  inputs: [
    { name: 'c0', type: 'vec3' },
    { name: 'c1', type: 'vec3' },
    { name: 'c2', type: 'vec3' }
  ]
})(([c0, c1, c2]) => {
  return mat3(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z)
})

const cameraDirectionWorld = (camera: Camera): NodeObject<'vec3'> => {
  const positionView = inverseProjectionMatrix(camera).mul(
    vec4(positionGeometry, 1)
  ).xyz
  const directionWorld = inverseViewMatrix(camera).mul(
    vec4(positionView, 0)
  ).xyz
  return directionWorld
}

const getLunarRadiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO
  name: 'getLunarRadiance',
  type: Luminance3,
  inputs: [{ name: 'moonAngularRadius', type: 'float' }]
})(([moonAngularRadius], builder) => {
  const { parameters } = AtmosphereContextNode.get(builder)
  const nodes = parameters.getNodes()

  return (
    nodes.solarIrradiance
      // Visual magnitude of the sun: m1 = -26.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
      // Visual magnitude of the moon: m2 = -12.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html)
      // Relative brightness: 10^{0.4*(m2-m1)} ≈ 0.0000025
      .mul(0.0000025)
      .div(PI.mul(moonAngularRadius.pow2()))
      .mul(nodes.sunRadianceToLuminance.mul(nodes.luminanceScale))
  )
})

const raySphereIntersectionNormal = /*#__PURE__*/ FnLayout({
  name: 'raySphereIntersectionNormal',
  type: 'vec3',
  inputs: [
    { name: 'rayDirection', type: 'vec3' },
    { name: 'centerDirection', type: 'vec3' },
    { name: 'angularRadius', type: 'float' }
  ]
})(([rayDirection, centerDirection, angularRadius]) => {
  const cosRay = centerDirection.dot(rayDirection).toVar()
  // The vector from the centerDirection to the projection point on the ray.
  const P = centerDirection.sub(rayDirection.mul(cosRay)).negate().toVar()
  // The half chord length along the ray.
  const s = sqrt(angularRadius.pow2().sub(P.dot(P)).max(0))
  return P.sub(rayDirection.mul(s)).div(angularRadius)
})

// Oren-Nayar diffuse of roughness = 1 and albedo = 1:
// Reference: https://mimosa-pudica.net/improved-oren-nayar.html
const orenNayarDiffuse = /*#__PURE__*/ FnLayout({
  name: 'orenNayarDiffuse',
  type: 'float',
  inputs: [
    { name: 'lightDirection', type: 'vec3' },
    { name: 'viewDirection', type: 'vec3' },
    { name: 'normal', type: 'vec3' }
  ]
})(([lightDirection, viewDirection, normal]) => {
  const cosLight = normal.dot(lightDirection).toVar()
  const cosView = normal.dot(viewDirection).toVar()
  const s = lightDirection.dot(viewDirection).sub(cosLight.mul(cosView)).toVar()
  const t = select(
    s.greaterThan(0),
    max(cosLight, cosView)
      // Avoid artifact at the edge:
      .max(0.1),
    1
  )
  const A = (1 / Math.PI) * (1 - 0.5 * (1 / 1.33) + 0.17 * (1 / 1.13))
  const B = (1 / Math.PI) * (0.45 * (1 / 1.09))
  return max(0, cosLight).mul(s.div(t).mul(B).add(A))
})

const SCREEN = 'SCREEN'
const WORLD = 'WORLD'
const EQUIRECTANGULAR = 'EQUIRECTANGULAR'

type SkyNodeScope = typeof SCREEN | typeof WORLD | typeof EQUIRECTANGULAR

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  shadowLengthNode?: Node<'float'> | null
  moonColorNode?: TextureNode | null
  moonNormalNode?: TextureNode | null

  moonAngularRadius = uniform(0.0045) // ≈ 15.5 arcminutes
  moonIntensity = uniform(1)

  // Static options:
  showSun = true
  showMoon = true

  private readonly scope: SkyNodeScope = SCREEN

  constructor(scope: SkyNodeScope, context: AtmosphereContextNode) {
    super('vec3')
    this.scope = scope
    this.atmosphereContext = context
  }

  override customCacheKey(): number {
    return hash(+this.showSun, +this.showMoon)
  }

  override setup(builder: NodeBuilder): unknown {
    if (builder.camera == null) {
      return
    }
    builder.getContext().atmosphere = this.atmosphereContext

    const { parameters, camera } = this.atmosphereContext
    const {
      worldToECEFMatrix,
      sunDirectionECEF,
      moonDirectionECEF,
      moonFixedToECEFMatrix,
      cameraPositionUnit
    } = this.atmosphereContext.getNodes()

    const { sunAngularRadius } = parameters.getNodes()

    // Direction of the camera ray:
    let directionWorld
    switch (this.scope) {
      case SCREEN:
        directionWorld = cameraDirectionWorld(camera)
        break
      case WORLD:
        directionWorld = cameraDirectionWorld(builder.camera)
        break
      case EQUIRECTANGULAR:
        directionWorld = equirectToDirectionWorld(uv())
        break
    }
    const rayDirectionECEF = worldToECEFMatrix
      .mul(vec4(directionWorld, 0))
      .xyz.toVertexStage()
      .normalize()

    const luminanceTransfer = getSkyLuminance(
      cameraPositionUnit,
      rayDirectionECEF,
      this.shadowLengthNode ?? 0,
      sunDirectionECEF
    )
    const inscatter = luminanceTransfer.get('luminance')
    const transmittance = luminanceTransfer.get('transmittance')

    return Fn(() => {
      const luminance = vec3(0).toVar()

      // Compute the luminance of the sun:
      if (this.showSun) {
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
        const chordThreshold = cos(this.moonAngularRadius).oneMinus().mul(2)
        const chordVector = rayDirectionECEF.sub(moonDirectionECEF)
        const chordLength = chordVector.dot(chordVector)
        const filterWidth = fwidth(chordLength)

        const moonLuminance = vec3().toVar()
        If(chordLength.lessThan(chordThreshold), () => {
          const normalECEF = raySphereIntersectionNormal(
            rayDirectionECEF,
            moonDirectionECEF,
            this.moonAngularRadius
          ).toVar()
          const normalMF = moonFixedToECEFMatrix
            .transpose()
            .mul(vec4(normalECEF, 0))
            .xyz.toVar()
          const uv = equirectUV(normalMF.xzy) // The equirectUV expects Y-up

          if (this.moonNormalNode != null) {
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
            const normalTangent = this.moonNormalNode
              .sample(uv)
              .xyz.mul(2)
              .sub(1)
            const tangentToLocal = mat3Columns(tangent, bitangent, normalMF)

            normalMF.assign(
              mix(
                normalMF,
                tangentToLocal.mul(normalTangent).normalize(),
                // Avoid artifact at the edge:
                normalECEF.dot(rayDirectionECEF.negate()).smoothstep(0, 0.3)
              )
            )
            normalECEF.assign(moonFixedToECEFMatrix.mul(vec4(normalMF, 0)).xyz)
          }

          const color = this.moonColorNode?.sample(uv).xyz ?? 1
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
            getLunarRadiance(this.moonAngularRadius)
              .mul(this.moonIntensity)
              .mul(color)
              .mul(diffuse)
              .mul(antialias)
          )
        })
        luminance.addAssign(moonLuminance)
      }

      return luminance.mul(transmittance).add(inscatter)
    })()
  }
}

export const sky = nodeProxy(SkyNode, SCREEN)
export const skyWorld = nodeProxy(SkyNode, WORLD)
export const skyBackground = nodeProxy(SkyNode, EQUIRECTANGULAR)
