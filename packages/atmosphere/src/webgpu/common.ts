// Based on: https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl

/**
 * Copyright (c) 2017 Eric Bruneton. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * Precomputed Atmospheric Scattering
 *
 * Copyright (c) 2008 INRIA. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

import {
  clamp,
  div,
  exp,
  float,
  floor,
  If,
  max,
  mix,
  mul,
  PI,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  atmosphereParametersStruct,
  densityProfileLayerStruct,
  densityProfileStruct,
  getAtmosphereContextBase,
  makeDestructible
} from './AtmosphereContextBase'
import {
  Area,
  Dimensionless,
  InverseSolidAngle,
  Length,
  type AbstractSpectrum,
  type DimensionlessSpectrum,
  type IrradianceSpectrum,
  type IrradianceTexture,
  type ScatteringTexture,
  type TransmittanceTexture
} from './dimensional'

export const clampCosine = /*#__PURE__*/ FnLayout({
  name: 'clampCosine',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})(([cosine]) => {
  return clamp(cosine, -1, 1)
})

const clampDistance = /*#__PURE__*/ FnLayout({
  name: 'clampDistance',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})(([distance]) => {
  return max(distance, 0)
})

export const clampRadius = /*#__PURE__*/ FnLayout({
  name: 'clampRadius',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length }
  ]
})(([parameters, radius]) => {
  const { topRadius, bottomRadius } = makeDestructible(parameters)
  return clamp(radius, bottomRadius, topRadius)
})

export const sqrtSafe = /*#__PURE__*/ FnLayout({
  name: 'sqrtSafe',
  type: Dimensionless,
  inputs: [{ name: 'area', type: Area }]
})(([area]) => {
  return sqrt(max(area, 0))
})

export const distanceToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'distanceToTopAtmosphereBoundary',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, radius, cosView]) => {
  const { topRadius } = makeDestructible(parameters)
  const discriminant = radius
    .pow2()
    .mul(cosView.pow2().sub(1))
    .add(topRadius.pow2())
  return clampDistance(radius.negate().mul(cosView).add(sqrtSafe(discriminant)))
})

export const distanceToBottomAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'distanceToBottomAtmosphereBoundary',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, radius, cosView]) => {
  const { bottomRadius } = makeDestructible(parameters)
  const discriminant = radius
    .pow2()
    .mul(cosView.pow2().sub(1))
    .add(bottomRadius.pow2())
  return clampDistance(radius.negate().mul(cosView).sub(sqrtSafe(discriminant)))
})

export const rayIntersectsGround = /*#__PURE__*/ FnLayout({
  name: 'rayIntersectsGround',
  type: 'bool',
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, radius, cosView]) => {
  const { bottomRadius } = makeDestructible(parameters)
  return cosView
    .lessThan(0)
    .and(
      radius
        .pow2()
        .mul(cosView.pow2().sub(1))
        .add(bottomRadius.pow2())
        .greaterThanEqual(0)
    )
})

const getTextureCoordFromUnitRange = /*#__PURE__*/ FnLayout({
  name: 'getTextureCoordFromUnitRange',
  type: 'float',
  inputs: [
    { name: 'unit', type: 'float' },
    { name: 'textureSize', type: 'float' }
  ]
})(([unit, textureSize]) => {
  return div(0.5, textureSize).add(
    unit.mul(textureSize.reciprocal().oneMinus())
  )
})

const getTransmittanceTextureUV = /*#__PURE__*/ FnLayout({
  name: 'getTransmittanceTextureUV',
  type: 'vec2',
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([parameters, radius, cosView]) => {
  const { topRadius, bottomRadius, transmittanceTextureSize } =
    makeDestructible(parameters)

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toConst()

  // Distance to the horizon for the view.
  const distanceToHorizon = sqrtSafe(
    radius.pow2().sub(bottomRadius.pow2())
  ).toConst()

  // Distance to the top atmosphere boundary for the ray (radius, cosView),
  // and its minimum and maximum values over all cosView - obtained for
  // (radius, 1) and (radius, cosHorizon).
  const distanceToTop = distanceToTopAtmosphereBoundary(
    parameters,
    radius,
    cosView
  )
  const minDistance = topRadius.sub(radius).toConst()
  const maxDistance = distanceToHorizon.add(H)
  const cosViewUnit = distanceToTop.remap(minDistance, maxDistance)
  const radiusUnit = distanceToHorizon.div(H)

  return vec2(
    getTextureCoordFromUnitRange(cosViewUnit, transmittanceTextureSize.x),
    getTextureCoordFromUnitRange(radiusUnit, transmittanceTextureSize.y)
  )
})

export const getTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TransmittanceTexture,
    radius: Node<Length>,
    cosView: Node<Dimensionless>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { transmittanceTextureSize } = context.parametersNode

      const uv = getTransmittanceTextureUV(
        context.parametersNode,
        radius,
        cosView
      )

      // Added for the precomputation stage in half-float precision. Manually
      // interpolate the transmittance instead of the optical depth.
      if (context.parameters.transmittancePrecisionLog) {
        const size = vec2(transmittanceTextureSize)
        const texelSize = vec3(size.reciprocal(), 0).toConst()
        const coord = uv.mul(size).sub(0.5).toConst()
        const i = coord.floor().add(0.5).mul(texelSize.xy).toConst()
        const f = coord.fract().toConst()
        const t1 = transmittanceTexture.sample(i)
        const t2 = transmittanceTexture.sample(i.add(texelSize.xz))
        const t3 = transmittanceTexture.sample(i.add(texelSize.zy))
        const t4 = transmittanceTexture.sample(i.add(texelSize.xy))
        const d1 = exp(t1.negate())
        const d2 = exp(t2.negate())
        const d3 = exp(t3.negate())
        const d4 = exp(t4.negate())
        return mix(mix(d1, d2, f.x), mix(d3, d4, f.x), f.y).rgb
      } else {
        return transmittanceTexture.sample(uv).rgb
      }
    }
)

export const getTransmittance = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TransmittanceTexture,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    rayLength: Node<Length>,
    viewRayIntersectsGround: Node<'bool'>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)

      const radiusI = clampRadius(
        context.parametersNode,
        sqrt(
          rayLength
            .pow2()
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.pow2())
        )
      ).toConst()
      const cosViewI = clampCosine(
        radius.mul(cosView).add(rayLength).div(radiusI)
      ).toConst()

      const transmittance = vec3(0).toVar()
      If(viewRayIntersectsGround, () => {
        const t1 = getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radiusI,
          cosViewI.negate()
        )
        const t2 = getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radius,
          cosView.negate()
        )
        transmittance.assign(t1.div(t2).min(1))
      }).Else(() => {
        const t1 = getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radius,
          cosView
        )
        const t2 = getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radiusI,
          cosViewI
        )
        transmittance.assign(t1.div(t2).min(1))
      })
      return transmittance
    }
)

export const getTransmittanceToSun = /*#__PURE__*/ FnVar(
  (
    transmittanceTexture: TransmittanceTexture,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { sunAngularRadius, bottomRadius } = context.parametersNode

      const sinHorizon = bottomRadius.div(radius).toConst()
      const cosHorizon = sqrt(max(sinHorizon.pow2().oneMinus(), 0)).negate()
      return getTransmittanceToTopAtmosphereBoundary(
        transmittanceTexture,
        radius,
        cosLight
      ).mul(
        smoothstep(
          sinHorizon.negate().mul(sunAngularRadius),
          sinHorizon.mul(sunAngularRadius),
          cosLight.sub(cosHorizon)
        )
      )
    }
)

// Rayleigh phase function:
// p(\theta) = \frac{3}{16\pi}(1+\cos^2\theta)
export const rayleighPhaseFunction = /*#__PURE__*/ FnLayout({
  name: 'rayleighPhaseFunction',
  type: InverseSolidAngle,
  inputs: [{ name: 'cosViewLight', type: Dimensionless }]
})(([cosViewLight]) => {
  const k = div(3, mul(16, PI))
  return k.mul(cosViewLight.pow2().add(1))
})

// Cornette-Shanks phase function:
// p(g,\theta) = \frac{3}{8\pi}\frac{(1-g^2)(1+\cos^2\theta)}{(2+g^2)(1+g^2-2g\cos\theta)^{3/2}}
export const miePhaseFunction = /*#__PURE__*/ FnLayout({
  name: 'miePhaseFunction',
  type: InverseSolidAngle,
  inputs: [
    { name: 'g', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless }
  ]
})(([g, cosViewLight]) => {
  const k = div(3, PI.mul(8)).mul(g.pow2().oneMinus()).div(g.pow2().add(2))
  return k
    .mul(cosViewLight.pow2().add(1))
    .div(g.pow2().sub(g.mul(2).mul(cosViewLight)).add(1).pow(1.5))
})

export const getScatteringTextureCoord = /*#__PURE__*/ FnLayout({
  name: 'getScatteringTextureCoord',
  type: 'vec4',
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  parameters,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  viewRayIntersectsGround
]) => {
  const {
    topRadius,
    bottomRadius,
    minCosLight,
    scatteringTextureRadiusSize,
    scatteringTextureCosViewSize,
    scatteringTextureCosLightSize
  } = makeDestructible(parameters)

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toConst()

  // Distance to the horizon for the view.
  const distanceToHorizon = sqrtSafe(
    radius.pow2().sub(bottomRadius.pow2())
  ).toConst()

  const radiusCoord = getTextureCoordFromUnitRange(
    distanceToHorizon.div(H),
    scatteringTextureRadiusSize
  )

  // Discriminant of the quadratic equation for the intersections of the ray
  // (radius, cosView) with the ground (see rayIntersectsGround).
  const radiusCosView = radius.mul(cosView).toConst()
  const discriminant = radiusCosView
    .pow2()
    .sub(radius.pow2())
    .add(bottomRadius.pow2())
    .toConst()

  const cosViewCoord = float(0).toVar()
  If(viewRayIntersectsGround, () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon).
    const distance = radiusCosView.negate().sub(sqrtSafe(discriminant))
    const minDistance = radius.sub(bottomRadius).toConst()
    const maxDistance = distanceToHorizon
    cosViewCoord.assign(
      getTextureCoordFromUnitRange(
        maxDistance
          .equal(minDistance)
          .select(0, distance.remap(minDistance, maxDistance)),
        scatteringTextureCosViewSize.div(2)
      )
        .oneMinus()
        .mul(0.5)
    )
  }).Else(() => {
    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon).
    const distance = radiusCosView
      .negate()
      .add(sqrtSafe(discriminant.add(H.pow2())))
    const minDistance = topRadius.sub(radius).toConst()
    const maxDistance = distanceToHorizon.add(H)
    cosViewCoord.assign(
      getTextureCoordFromUnitRange(
        distance.remap(minDistance, maxDistance),
        scatteringTextureCosViewSize.div(2)
      )
        .add(1)
        .mul(0.5)
    )
  })

  const minDistance = topRadius.sub(bottomRadius).toConst()
  const maxDistance = H
  const d = distanceToTopAtmosphereBoundary(parameters, bottomRadius, cosLight)
  const a = d.remap(minDistance, maxDistance).toConst()
  const D = distanceToTopAtmosphereBoundary(
    parameters,
    bottomRadius,
    minCosLight
  )
  const A = D.remap(minDistance, maxDistance)

  // An ad-hoc function equal to 0 for cosLight = minCosLight (because then
  // d = D and thus a = A), equal to 1 for cosLight = 1 (because then d =
  // minDistance and thus a = 0), and with a large slope around cosLight = 0, to
  // get more texture samples near the horizon.
  const cosLightCoord = getTextureCoordFromUnitRange(
    max(a.div(A).oneMinus(), 0).div(a.add(1)),
    scatteringTextureCosLightSize
  )
  const cosViewLightCoord = cosViewLight.add(1).mul(0.5)

  return vec4(cosViewLightCoord, cosLightCoord, cosViewCoord, radiusCoord)
})

export const getScattering = /*#__PURE__*/ FnVar(
  (
    scatteringTexture: ScatteringTexture,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    viewRayIntersectsGround: Node<'bool'>
  ) =>
    (builder): Node<AbstractSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { scatteringTextureCosViewLightSize } = context.parametersNode

      const coord = getScatteringTextureCoord(
        context.parametersNode,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        viewRayIntersectsGround
      ).toConst()
      const texCoordX = coord.x
        .mul(scatteringTextureCosViewLightSize.sub(1))
        .toConst()
      const texX = floor(texCoordX).toConst()
      const lerp = texCoordX.sub(texX).toConst()
      const coord0 = vec3(
        texX.add(coord.y).div(scatteringTextureCosViewLightSize),
        coord.z,
        coord.w
      )
      const coord1 = vec3(
        texX.add(1).add(coord.y).div(scatteringTextureCosViewLightSize),
        coord.z,
        coord.w
      )
      return scatteringTexture
        .sample(coord0)
        .mul(lerp.oneMinus())
        .add(scatteringTexture.sample(coord1).mul(lerp)).rgb
    }
)

const getIrradianceTextureUV = /*#__PURE__*/ FnLayout({
  name: 'getIrradianceTextureUV',
  type: 'vec2',
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosLight', type: Dimensionless }
  ]
})(([parameters, radius, cosLight]) => {
  const { topRadius, bottomRadius, irradianceTextureSize } =
    makeDestructible(parameters)

  const radiusUnit = radius.remap(bottomRadius, topRadius)
  const cosLightUnit = cosLight.mul(0.5).add(0.5)
  return vec2(
    getTextureCoordFromUnitRange(cosLightUnit, irradianceTextureSize.x),
    getTextureCoordFromUnitRange(radiusUnit, irradianceTextureSize.y)
  )
})

export const getIrradiance = /*#__PURE__*/ FnVar(
  (
    irradianceTexture: IrradianceTexture,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ) =>
    (builder): Node<IrradianceSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const uv = getIrradianceTextureUV(
        context.parametersNode,
        radius,
        cosLight
      )
      return irradianceTexture.sample(uv).rgb
    }
)

const getLayerDensity = /*#__PURE__*/ FnLayout({
  name: 'getLayerDensity',
  type: Dimensionless,
  inputs: [
    { name: 'layer', type: densityProfileLayerStruct },
    { name: 'altitude', type: Length }
  ]
})(([layer, altitude]) => {
  const expTerm = layer.get('expTerm')
  const expScale = layer.get('expScale')
  const linearTerm = layer.get('linearTerm')
  const constantTerm = layer.get('constantTerm')
  return expTerm
    .mul(exp(expScale.mul(altitude)))
    .add(linearTerm.mul(altitude))
    .add(constantTerm)
    .saturate()
})

export const getProfileDensity = /*#__PURE__*/ FnLayout({
  name: 'getProfileDensity',
  type: Dimensionless,
  inputs: [
    { name: 'layer', type: densityProfileStruct },
    { name: 'altitude', type: Length }
  ]
})(([profile, altitude]) => {
  return altitude
    .lessThan(profile.get('layer0').get('width'))
    .select(
      getLayerDensity(profile.get('layer0'), altitude),
      getLayerDensity(profile.get('layer1'), altitude)
    )
})
