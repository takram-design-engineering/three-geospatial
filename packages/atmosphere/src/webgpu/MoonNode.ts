import {
  cos,
  dFdx,
  dFdy,
  equirectUV,
  Fn,
  fwidth,
  If,
  max,
  mix,
  PI,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { TempNode, type NodeBuilder, type TextureNode } from 'three/webgpu'

import { FnLayout, type Node } from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import {
  atmosphereParametersStruct,
  makeDestructible
} from './AtmosphereContextBase'
import { Luminance3 } from './dimensional'

const getLunarRadiance = /*#__PURE__*/ FnLayout({
  name: 'getLunarRadiance',
  type: Luminance3,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'moonAngularRadius', type: 'float' }
  ]
})(([parameters, moonAngularRadius]) => {
  const { solarIrradiance, sunRadianceToLuminance, luminanceScale } =
    makeDestructible(parameters)

  return (
    solarIrradiance
      // Visual magnitude of the sun: m1 = -26.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
      // Visual magnitude of the moon: m2 = -12.74
      // (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html)
      // Relative brightness: 10^{-0.4*(m2-m1)} ≈ 2.5e-6
      .mul(2.5e-6)
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
  const cosRay = centerDirection.dot(rayDirection)
  // The vector from the centerDirection to the projection point on the ray.
  const P = centerDirection.sub(rayDirection.mul(cosRay)).negate().toConst()
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
  const cosLight = normal.dot(lightDirection).toConst()
  const cosView = normal.dot(viewDirection).toConst()
  const s = lightDirection
    .dot(viewDirection)
    .sub(cosLight.mul(cosView))
    .toConst()
  // Avoid artifact at the edge:
  const t = mix(1, max(cosLight, cosView).max(0.1), s.smoothstep(0, 0.1))
  const A = (1 / Math.PI) * (1 - 0.5 * (1 / 1.33) + 0.17 * (1 / 1.13))
  const B = (1 / Math.PI) * (0.45 * (1 / 1.09))
  return cosLight.max(0).mul(s.div(t).mul(B).add(A))
})

export class MoonNode extends TempNode {
  static override get type(): string {
    return 'MoonNode'
  }

  rayDirectionECEF?: Node
  colorNode?: TextureNode | null
  displacementNode?: TextureNode | null

  angularRadius = uniform(0.0045) // ≈ 15.5 arcminutes
  intensity = uniform(1)

  // For NASA Moon Kit unsigned 16 bit half-meter images:
  // https://svs.gsfc.nasa.gov/4720/
  displacementScale = uniform((0xffff * 0.5) / 1727400)

  constructor() {
    super('vec4')
  }

  override setup(builder: NodeBuilder): unknown {
    const atmosphereContext = getAtmosphereContext(builder)

    const { rayDirectionECEF } = this
    if (rayDirectionECEF == null) {
      return
    }
    const {
      sunDirectionECEF,
      moonDirectionECEF: directionECEF,
      matrixMoonFixedToECEF: matrixFixedToECEF
    } = atmosphereContext

    return Fn(() => {
      const chordThreshold = cos(this.angularRadius).oneMinus().mul(2)
      const chordVector = rayDirectionECEF.sub(directionECEF)
      const chordLength = chordVector.dot(chordVector)
      const filterWidth = fwidth(chordLength)

      const uv = vec2().toVar()
      const normalECEF = vec3().toVar()
      const normalMF = vec3().toVar()

      If(chordLength.lessThan(chordThreshold), () => {
        normalECEF.assign(
          raySphereIntersectionNormal(
            rayDirectionECEF,
            directionECEF,
            this.angularRadius
          )
        )
        normalMF.assign(
          matrixFixedToECEF.transpose().mul(vec4(normalECEF, 0)).xyz
        )
        uv.assign(equirectUV(normalMF.xzy)) // The equirectUV expects Y-up
      })

      const uvdx = dFdx(uv).toConst()
      const uvdy = dFdy(uv).toConst()
      const ndx = dFdx(normalMF).toConst()
      const ndy = dFdy(normalMF).toConst()

      const luminance = vec4(0).toVar()
      If(chordLength.lessThan(chordThreshold), () => {
        if (this.displacementNode != null) {
          const hx1 = this.displacementNode.sample(uv.add(uvdx)).x
          const hx2 = this.displacementNode.sample(uv.sub(uvdx)).x
          const hy1 = this.displacementNode.sample(uv.add(uvdy)).x
          const hy2 = this.displacementNode.sample(uv.sub(uvdy)).x
          const hdx = hx1.sub(hx2).mul(0.5)
          const hdy = hy1.sub(hy2).mul(0.5)

          // Cotangent frame: compute surface gradient from screen-space
          // derivatives of the surface position.
          const r1 = ndy.cross(normalMF).toConst()
          const r2 = normalMF.cross(ndx).toConst()
          const det = ndx.dot(r1).toConst()

          // Perturbed normal in moon-fixed frame:
          const grad = r1.mul(hdx).add(r2.mul(hdy)).mul(det.sign())
          const perturbedNormalMF = normalMF
            .mul(det.abs())
            .sub(grad.mul(this.displacementScale))
            .normalize()

          normalMF.assign(
            mix(
              normalMF,
              perturbedNormalMF,
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
            getLunarRadiance(
              atmosphereContext.parametersNode,
              this.angularRadius
            )
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
