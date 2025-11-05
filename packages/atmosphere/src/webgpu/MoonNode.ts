import {
  cos,
  equirectUV,
  Fn,
  fwidth,
  If,
  mat3,
  max,
  mix,
  PI,
  select,
  smoothstep,
  sqrt,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { AtmosphereContextNode } from './AtmosphereContextNode'
import { Luminance3 } from './dimensional'

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

const getLunarRadiance = /*#__PURE__*/ FnLayout({
  name: 'getLunarRadiance',
  type: Luminance3,
  inputs: [{ name: 'moonAngularRadius', type: 'float' }]
})(([moonAngularRadius], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const { solarIrradiance, sunRadianceToLuminance, luminanceScale } = context

  return (
    solarIrradiance
      // Visual magnitude of the sun: m1 = -26.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
      // Visual magnitude of the moon: m2 = -12.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html)
      // Relative brightness: 10^{0.4*(m2-m1)} ≈ 0.0000025
      .mul(0.0000025)
      .div(PI.mul(moonAngularRadius.pow2()))
      .mul(sunRadianceToLuminance.mul(luminanceScale))
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

export class MoonNode extends TempNode {
  static override get type(): string {
    return 'MoonNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  rayDirectionECEF?: Node
  colorNode?: TextureNode | null
  normalNode?: TextureNode | null

  angularRadius = uniform(0.0045) // ≈ 15.5 arcminutes
  intensity = uniform(1)

  constructor(atmosphereContext: AtmosphereContextNode) {
    super('vec4')
    this.atmosphereContext = atmosphereContext
  }

  override setup(builder: NodeBuilder): unknown {
    builder.getContext().atmosphere = this.atmosphereContext

    const { rayDirectionECEF } = this
    if (rayDirectionECEF == null) {
      return
    }
    const {
      sunDirectionECEF,
      moonDirectionECEF: directionECEF,
      matrixMoonFixedToECEF: matrixFixedToECEF
    } = this.atmosphereContext

    return Fn(() => {
      const chordThreshold = cos(this.angularRadius).oneMinus().mul(2)
      const chordVector = rayDirectionECEF.sub(directionECEF)
      const chordLength = chordVector.dot(chordVector)
      const filterWidth = fwidth(chordLength)

      const luminance = vec4(0).toVar()
      If(chordLength.lessThan(chordThreshold), () => {
        const normalECEF = raySphereIntersectionNormal(
          rayDirectionECEF,
          directionECEF,
          this.angularRadius
        ).toVar()
        const normalMF = matrixFixedToECEF
          .transpose()
          .mul(vec4(normalECEF, 0))
          .xyz.toVar()
        const uv = equirectUV(normalMF.xzy) // The equirectUV expects Y-up

        if (this.normalNode != null) {
          // Apply the normal texture and convert it back to the ECEF space.
          const localX = vec3(1, 0, 0)
          const localZ = vec3(0, 0, 1)
          const tangent = localZ.cross(normalMF).toVar()
          tangent.assign(
            select(
              tangent.dot(tangent).lessThan(1e-7),
              localX.cross(normalMF).normalize(),
              tangent.normalize()
            )
          )
          const bitangent = normalMF.cross(tangent).normalize()
          const normalTangent = this.normalNode.sample(uv).xyz.mul(2).sub(1)
          const tangentToLocal = mat3Columns(tangent, bitangent, normalMF)

          normalMF.assign(
            mix(
              normalMF,
              tangentToLocal.mul(normalTangent).normalize(),
              // Avoid artifact at the edge:
              normalECEF.dot(rayDirectionECEF.negate()).smoothstep(0, 0.3)
            )
          )
          normalECEF.assign(matrixFixedToECEF.mul(vec4(normalMF, 0)).xyz)
        }

        const color = this.colorNode?.sample(uv).xyz ?? 1
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
        luminance.assign(
          vec4(
            getLunarRadiance(this.angularRadius)
              .mul(this.intensity)
              .mul(color)
              .mul(diffuse),
            antialias
          )
        )
      })

      return luminance
    })()
  }
}
