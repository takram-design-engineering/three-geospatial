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
  add,
  bool,
  clamp,
  div,
  exp,
  float,
  floor,
  If,
  max,
  min,
  mul,
  PI,
  smoothstep,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import type { Texture3DNode, TextureNode } from 'three/webgpu'

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
  DimensionlessSpectrum,
  InverseSolidAngle,
  IrradianceSpectrum,
  Length,
  RadianceSpectrum,
  type AbstractSpectrum
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

export const distanceToNearestAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  name: 'distanceToNearestAtmosphereBoundary',
  type: Length,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'intersectsGround', type: 'bool' }
  ]
})(([parameters, radius, cosView, intersectsGround]) => {
  return intersectsGround.select(
    distanceToBottomAtmosphereBoundary(parameters, radius, cosView),
    distanceToTopAtmosphereBoundary(parameters, radius, cosView)
  )
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
    transmittanceNode: TextureNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context

      const uv = getTransmittanceTextureUV(parametersNode, radius, cosView)
      return transmittanceNode.sample(uv).rgb
    }
)

export const getTransmittance = /*#__PURE__*/ FnVar(
  (
    transmittanceNode: TextureNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    rayLength: Node<Length>,
    intersectsGround: Node<'bool'>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context

      const radiusEnd = clampRadius(
        parametersNode,
        sqrt(
          rayLength
            .pow2()
            .add(mul(2, radius, cosView, rayLength))
            .add(radius.pow2())
        )
      ).toConst()
      const cosViewEnd = clampCosine(
        radius.mul(cosView).add(rayLength).div(radiusEnd)
      ).toConst()

      const transmittance = vec3(0).toVar()
      If(intersectsGround, () => {
        transmittance.assign(
          min(
            getTransmittanceToTopAtmosphereBoundary(
              transmittanceNode,
              radiusEnd,
              cosViewEnd.negate()
            ).div(
              getTransmittanceToTopAtmosphereBoundary(
                transmittanceNode,
                radius,
                cosView.negate()
              )
            ),
            vec3(1)
          )
        )
      }).Else(() => {
        transmittance.assign(
          min(
            getTransmittanceToTopAtmosphereBoundary(
              transmittanceNode,
              radius,
              cosView
            ).div(
              getTransmittanceToTopAtmosphereBoundary(
                transmittanceNode,
                radiusEnd,
                cosViewEnd
              )
            ),
            vec3(1)
          )
        )
      })
      return transmittance
    }
)

export const getTransmittanceToSun = /*#__PURE__*/ FnVar(
  (
    transmittanceNode: TextureNode,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ) =>
    (builder): Node<DimensionlessSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const { sunAngularRadius, bottomRadius } = parametersNode

      const sinHorizon = bottomRadius.div(radius).toConst()
      const cosHorizon = sqrt(max(sinHorizon.pow2().oneMinus(), 0)).negate()
      return getTransmittanceToTopAtmosphereBoundary(
        transmittanceNode,
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
    { name: 'intersectsGround', type: 'bool' }
  ]
})(([
  parameters,
  radius,
  cosView,
  cosLight,
  cosViewLight,
  intersectsGround
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
  If(intersectsGround, () => {
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
    scatteringNode: Texture3DNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    intersectsGround: Node<'bool'>
  ) =>
    (builder): Node<AbstractSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const { scatteringTextureCosViewLightSize } = parametersNode

      const coord = getScatteringTextureCoord(
        parametersNode,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        intersectsGround
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
      return scatteringNode
        .sample(coord0)
        .mul(lerp.oneMinus())
        .add(scatteringNode.sample(coord1).mul(lerp)).rgb
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
    irradianceNode: TextureNode,
    radius: Node<Length>,
    cosLight: Node<Dimensionless>
  ) =>
    (builder): Node<IrradianceSpectrum> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const uv = getIrradianceTextureUV(parametersNode, radius, cosLight)
      return irradianceNode.sample(uv).rgb
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

export const getUnitRangeFromTextureCoord = /*#__PURE__*/ FnLayout({
  name: 'getUnitRangeFromTextureCoord',
  type: 'float',
  inputs: [
    { name: 'coord', type: 'float' },
    { name: 'textureSize', type: 'float' }
  ]
})(([coord, textureSize]) => {
  const texelSize = textureSize.reciprocal()
  return coord.sub(texelSize.mul(0.5)).div(texelSize.oneMinus())
})

export const scatteringParamsStruct = /*#__PURE__*/ struct(
  {
    radius: Length,
    cosView: Dimensionless,
    cosLight: Dimensionless,
    cosViewLight: Dimensionless,
    intersectsGround: 'bool'
  },
  'ScatteringParams'
)

const getParamsFromScatteringTextureCoord = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromScatteringTextureCoord',
  type: scatteringParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'coord', type: 'vec4' }
  ]
})(([parameters, coord]) => {
  const {
    bottomRadius,
    topRadius,
    minCosLight,
    scatteringTextureRadiusSize,
    scatteringTextureCosViewSize,
    scatteringTextureCosLightSize
  } = makeDestructible(parameters)

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toConst()

  // Distance to the horizon.
  const distanceToHorizon = H.mul(
    getUnitRangeFromTextureCoord(coord.w, scatteringTextureRadiusSize)
  ).toConst()
  const radius = sqrt(distanceToHorizon.pow2().add(bottomRadius.pow2()))

  const cosView = float(0).toVar()
  const intersectsGround = bool().toVar()
  If(coord.z.lessThan(0.5), () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon) - from which we can recover cosView.
    const minDistance = radius.sub(bottomRadius).toConst()
    const maxDistance = distanceToHorizon
    const distance = minDistance
      .add(
        maxDistance
          .sub(minDistance)
          .mul(
            getUnitRangeFromTextureCoord(
              coord.z.mul(2).oneMinus(),
              scatteringTextureCosViewSize.div(2)
            )
          )
      )
      .toConst()
    cosView.assign(
      distance.equal(0).select(
        -1,
        clampCosine(
          distanceToHorizon
            .pow2()
            .add(distance.pow2())
            .negate()
            .div(mul(2, radius, distance))
        )
      )
    )
    intersectsGround.assign(bool(true))
  }).Else(() => {
    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon) - from which we can recover
    // cosView.
    const minDistance = topRadius.sub(radius).toConst()
    const maxDistance = distanceToHorizon.add(H)
    const distance = minDistance
      .add(
        maxDistance
          .sub(minDistance)
          .mul(
            getUnitRangeFromTextureCoord(
              coord.z.mul(2).sub(1),
              scatteringTextureCosViewSize.div(2)
            )
          )
      )
      .toConst()
    cosView.assign(
      distance.equal(0).select(
        1,
        clampCosine(
          H.pow2()
            .sub(distanceToHorizon.pow2())
            .sub(distance.pow2())
            .div(mul(2, radius, distance))
        )
      )
    )
    intersectsGround.assign(bool(false))
  })

  const cosLightUnit = getUnitRangeFromTextureCoord(
    coord.y,
    scatteringTextureCosLightSize
  ).toConst()
  const minDistance = topRadius.sub(bottomRadius).toConst()
  const maxDistance = H
  const D = distanceToTopAtmosphereBoundary(
    parameters,
    bottomRadius,
    minCosLight
  )
  const A = D.remap(minDistance, maxDistance).toConst()
  const a = A.sub(cosLightUnit.mul(A)).div(cosLightUnit.mul(A).add(1))
  const distance = minDistance
    .add(min(a, A).mul(maxDistance.sub(minDistance)))
    .toConst()
  const cosLight = distance.equal(0).select(
    1,
    clampCosine(
      H.pow2()
        .sub(distance.pow2())
        .div(mul(2, bottomRadius, distance))
    )
  )
  const cosViewLight = clampCosine(coord.x.mul(2).sub(1))

  return scatteringParamsStruct(
    radius,
    cosView,
    cosLight,
    cosViewLight,
    intersectsGround
  )
})

export const getParamsFromScatteringTextureFragCoord = /*#__PURE__*/ FnLayout({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: true,
  name: 'getParamsFromScatteringTextureFragCoord',
  type: scatteringParamsStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'fragCoord', type: 'vec3' }
  ]
})(([parameters, fragCoord]) => {
  const {
    scatteringTextureRadiusSize,
    scatteringTextureCosViewSize,
    scatteringTextureCosLightSize,
    scatteringTextureCosViewLightSize
  } = makeDestructible(parameters)

  const fragCoordCosViewLight = floor(
    fragCoord.x.div(scatteringTextureCosLightSize)
  )
  const fragCoordCosLight = fragCoord.x.mod(scatteringTextureCosLightSize)
  const size = vec4(
    scatteringTextureCosViewLightSize.sub(1),
    scatteringTextureCosLightSize,
    scatteringTextureCosViewSize,
    scatteringTextureRadiusSize
  )
  const coord = vec4(
    fragCoordCosViewLight,
    fragCoordCosLight,
    fragCoord.y,
    fragCoord.z
  ).div(size)
  const scatteringParams = getParamsFromScatteringTextureCoord(
    parameters,
    coord
  ).toConst()
  const radius = scatteringParams.get('radius')
  const cosView = scatteringParams.get('cosView')
  const cosLight = scatteringParams.get('cosLight')
  const cosViewLight = scatteringParams.get('cosViewLight').toVar()
  const intersectsGround = scatteringParams.get('intersectsGround')

  // Clamp cosViewLight to its valid range of values, given cosView and cosLight.
  const sideRange = sqrt(
    cosView.pow2().oneMinus().mul(cosLight.pow2().oneMinus())
  ).toConst()
  cosViewLight.assign(
    clamp(
      cosViewLight,
      cosView.mul(cosLight).sub(sideRange),
      cosView.mul(cosLight).add(sideRange)
    )
  )
  return scatteringParamsStruct(
    radius,
    cosView,
    cosLight,
    cosViewLight,
    intersectsGround
  )
})

export const getExtrapolatedSingleMieScattering = /*#__PURE__*/ FnLayout({
  name: 'getExtrapolatedSingleMieScattering',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'scattering', type: 'vec4' },
    { name: 'rayleighScattering', type: 'vec3' },
    { name: 'mieScattering', type: 'vec3' }
  ]
})(([scattering, rayleighScattering, mieScattering]) => {
  // Algebraically this can never be negative, but rounding errors can produce
  // that effect for sufficiently short view rays.
  const singleMieScattering = vec3(0).toVar()
  // Avoid division by infinitesimal values.
  If(scattering.r.greaterThanEqual(1e-5), () => {
    singleMieScattering.assign(
      scattering.rgb
        .mul(scattering.a)
        .div(scattering.r)
        .mul(rayleighScattering.r.div(mieScattering.r))
        .mul(mieScattering.div(rayleighScattering))
    )
  })
  return singleMieScattering
})

export const combinedScatteringStruct = /*#__PURE__*/ struct(
  {
    scattering: IrradianceSpectrum,
    singleMieScattering: IrradianceSpectrum
  },
  'CombinedScattering'
)

export const getCombinedScattering = /*#__PURE__*/ FnVar(
  (
    parameters: ReturnType<typeof atmosphereParametersStruct>,
    scatteringNode: Texture3DNode,
    singleMieScatteringNode: Texture3DNode,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    intersectsGround: Node<'bool'>
  ) =>
    (builder): ReturnType<typeof combinedScatteringStruct> => {
      const context = getAtmosphereContextBase(builder)
      const {
        rayleighScattering,
        mieScattering,
        scatteringTextureCosViewLightSize
      } = makeDestructible(parameters)

      const coord = getScatteringTextureCoord(
        parameters,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        intersectsGround
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
      ).toConst()
      const coord1 = vec3(
        texX.add(1).add(coord.y).div(scatteringTextureCosViewLightSize),
        coord.z,
        coord.w
      ).toConst()

      const scattering = vec3(0).toVar()
      const singleMieScattering = vec3(0).toVar()

      if (context.parameters.combinedScatteringTextures) {
        const combinedScattering = add(
          scatteringNode.sample(coord0).mul(lerp.oneMinus()),
          scatteringNode.sample(coord1).mul(lerp)
        ).toConst()
        scattering.assign(combinedScattering.rgb)
        singleMieScattering.assign(
          getExtrapolatedSingleMieScattering(
            combinedScattering,
            rayleighScattering,
            mieScattering
          )
        )
      } else {
        scattering.assign(
          add(
            scatteringNode.sample(coord0).mul(lerp.oneMinus()),
            scatteringNode.sample(coord1).mul(lerp)
          ).rgb
        )
        singleMieScattering.assign(
          add(
            singleMieScatteringNode.sample(coord0).mul(lerp.oneMinus()),
            singleMieScatteringNode.sample(coord1).mul(lerp)
          ).rgb
        )
      }
      return combinedScatteringStruct(scattering, singleMieScattering)
    }
)

export const radianceTransferStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    transmittance: DimensionlessSpectrum
  },
  'RadianceTransfer'
)
