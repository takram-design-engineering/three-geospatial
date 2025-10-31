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
  fract,
  If,
  max,
  min,
  mix,
  mul,
  PI,
  select,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { AtmosphereContextBaseNode } from './AtmosphereContextBaseNode'
import {
  AbstractScatteringTexture,
  AbstractSpectrum,
  Area,
  Dimensionless,
  DimensionlessSpectrum,
  InverseSolidAngle,
  IrradianceSpectrum,
  IrradianceTexture,
  Length,
  TransmittanceTexture
} from './dimensional'

export const clampCosine = /*#__PURE__*/ FnLayout({
  name: 'clampCosine',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})(([cosine]) => {
  return clamp(cosine, -1, 1)
})

export const clampDistance = /*#__PURE__*/ FnLayout({
  name: 'clampDistance',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})(([distance]) => {
  return max(distance, 0)
})

export const clampRadius = /*#__PURE__*/ FnLayout({
  name: 'clampRadius',
  type: Length,
  inputs: [{ name: 'radius', type: Length }]
})(([radius], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { topRadius, bottomRadius } = context

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
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { topRadius } = context

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
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { bottomRadius } = context

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
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { bottomRadius } = context

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

export const getTextureCoordFromUnitRange = /*#__PURE__*/ FnLayout({
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

export const getTransmittanceTextureUV = /*#__PURE__*/ FnLayout({
  name: 'getTransmittanceTextureUV',
  type: 'vec2',
  inputs: [
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([radius, cosView], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius } = context

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toVar()

  // Distance to the horizon for the view.
  const distanceToHorizon = sqrtSafe(
    radius.pow2().sub(bottomRadius.pow2())
  ).toVar()

  // Distance to the top atmosphere boundary for the ray (radius, cosView),
  // and its minimum and maximum values over all cosView - obtained for
  // (radius, 1) and (radius, cosHorizon).
  const distanceToTop = distanceToTopAtmosphereBoundary(radius, cosView)
  const minDistance = topRadius.sub(radius).toVar()
  const maxDistance = distanceToHorizon.add(H)
  const cosViewUnit = distanceToTop.remap(minDistance, maxDistance)
  const radiusUnit = distanceToHorizon.div(H)

  return vec2(
    getTextureCoordFromUnitRange(
      cosViewUnit,
      parameters.transmittanceTextureSize.x
    ),
    getTextureCoordFromUnitRange(
      radiusUnit,
      parameters.transmittanceTextureSize.y
    )
  )
})

export const getTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getTransmittanceToTopAtmosphereBoundary',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([transmittanceTexture, radius, cosView], builder) => {
  const { parameters } = AtmosphereContextBaseNode.get(builder)

  const uv = getTransmittanceTextureUV(radius, cosView)

  // Added for the precomputation stage in half-float precision. Manually
  // interpolate the transmittance instead of the optical depth.
  if (parameters.transmittancePrecisionLog) {
    const size = vec2(parameters.transmittanceTextureSize)
    const texelSize = vec3(size.reciprocal(), 0).toConst()
    const coord = uv.mul(size).sub(0.5).toVar()
    const i = floor(coord).add(0.5).mul(texelSize.xy).toVar()
    const f = fract(coord).toVar()
    const t1 = exp(transmittanceTexture.sample(i).negate())
    const t2 = exp(transmittanceTexture.sample(i.add(texelSize.xz)).negate())
    const t3 = exp(transmittanceTexture.sample(i.add(texelSize.zy)).negate())
    const t4 = exp(transmittanceTexture.sample(i.add(texelSize.xy)).negate())
    return mix(mix(t1, t2, f.x), mix(t3, t4, f.x), f.y).rgb
  } else {
    return transmittanceTexture.sample(uv).rgb
  }
})

export const getTransmittance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getTransmittance',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'rayLength', type: Length },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})(([
  transmittanceTexture,
  radius,
  cosView,
  rayLength,
  viewRayIntersectsGround
]) => {
  const radiusEnd = clampRadius(
    sqrt(
      rayLength
        .pow2()
        .add(mul(2, radius, cosView, rayLength))
        .add(radius.pow2())
    )
  ).toVar()
  const cosViewEnd = clampCosine(
    radius.mul(cosView).add(rayLength).div(radiusEnd)
  ).toVar()

  const transmittance = vec3().toVar()
  If(viewRayIntersectsGround, () => {
    transmittance.assign(
      min(
        getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radiusEnd,
          cosViewEnd.negate()
        ).div(
          getTransmittanceToTopAtmosphereBoundary(
            transmittanceTexture,
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
          transmittanceTexture,
          radius,
          cosView
        ).div(
          getTransmittanceToTopAtmosphereBoundary(
            transmittanceTexture,
            radiusEnd,
            cosViewEnd
          )
        ),
        vec3(1)
      )
    )
  })
  return transmittance
})

export const getTransmittanceToSun = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getTransmittanceToSun',
  type: DimensionlessSpectrum,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless }
  ]
})(([transmittanceTexture, radius, cosSun], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { sunAngularRadius, bottomRadius } = context

  const sinHorizon = bottomRadius.div(radius).toVar()
  const cosHorizon = sqrt(max(sinHorizon.pow2().oneMinus(), 0)).negate()
  return getTransmittanceToTopAtmosphereBoundary(
    transmittanceTexture,
    radius,
    cosSun
  ).mul(
    smoothstep(
      sinHorizon.negate().mul(sunAngularRadius),
      sinHorizon.mul(sunAngularRadius),
      cosSun.sub(cosHorizon)
    )
  )
})

// Rayleigh phase function:
// p(\theta) = \frac{3}{16\pi}(1+\cos^2\theta)
export const rayleighPhaseFunction = /*#__PURE__*/ FnLayout({
  name: 'rayleighPhaseFunction',
  type: InverseSolidAngle,
  inputs: [{ name: 'cosViewSun', type: Dimensionless }]
})(([cosViewSun]) => {
  const k = div(3, mul(16, PI))
  return k.mul(cosViewSun.pow2().add(1))
})

// Cornette-Shanks phase function:
// p(g,\theta) = \frac{3}{8\pi}\frac{(1-g^2)(1+\cos^2\theta)}{(2+g^2)(1+g^2-2g\cos\theta)^{3/2}}
export const miePhaseFunction = /*#__PURE__*/ FnLayout({
  name: 'miePhaseFunction',
  type: InverseSolidAngle,
  inputs: [
    { name: 'g', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless }
  ]
})(([g, cosViewSun]) => {
  const k = div(3, PI.mul(8)).mul(g.pow2().oneMinus()).div(g.pow2().add(2))
  return k
    .mul(cosViewSun.pow2().add(1))
    .div(g.pow2().sub(g.mul(2).mul(cosViewSun)).add(1).pow(1.5))
})

export const getScatteringTextureCoord = /*#__PURE__*/ FnLayout({
  name: 'getScatteringTextureCoord',
  type: 'vec4',
  inputs: [
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [radius, cosView, cosSun, cosViewSun, viewRayIntersectsGround],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius, minCosSun } = context

  // Distance to top atmosphere boundary for a horizontal ray at ground level.
  const H = sqrt(topRadius.pow2().sub(bottomRadius.pow2())).toVar()

  // Distance to the horizon for the view.
  const distanceToHorizon = sqrtSafe(
    radius.pow2().sub(bottomRadius.pow2())
  ).toVar()

  const radiusCoord = getTextureCoordFromUnitRange(
    distanceToHorizon.div(H),
    parameters.scatteringTextureRadiusSize
  )

  // Discriminant of the quadratic equation for the intersections of the ray
  // (radius, cosView) with the ground (see rayIntersectsGround).
  const radiusCosView = radius.mul(cosView).toVar()
  const discriminant = radiusCosView
    .pow2()
    .sub(radius.pow2())
    .add(bottomRadius.pow2())
    .toVar()

  const cosViewCoord = float().toVar()
  If(viewRayIntersectsGround, () => {
    // Distance to the ground for the ray (radius, cosView), and its minimum
    // and maximum values over all cosView - obtained for (radius, -1) and
    // (radius, cosHorizon).
    const distance = radiusCosView.negate().sub(sqrtSafe(discriminant))
    const minDistance = radius.sub(bottomRadius).toVar()
    const maxDistance = distanceToHorizon
    cosViewCoord.assign(
      getTextureCoordFromUnitRange(
        select(
          maxDistance.equal(minDistance),
          0,
          distance.remap(minDistance, maxDistance)
        ),
        parameters.scatteringTextureCosViewSize / 2
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
    const minDistance = topRadius.sub(radius).toVar()
    const maxDistance = distanceToHorizon.add(H)
    cosViewCoord.assign(
      getTextureCoordFromUnitRange(
        distance.remap(minDistance, maxDistance),
        parameters.scatteringTextureCosViewSize / 2
      )
        .add(1)
        .mul(0.5)
    )
  })

  const minDistance = topRadius.sub(bottomRadius).toVar()
  const maxDistance = H
  const d = distanceToTopAtmosphereBoundary(bottomRadius, cosSun)
  const a = d.remap(minDistance, maxDistance).toVar()
  const D = distanceToTopAtmosphereBoundary(bottomRadius, minCosSun)
  const A = D.remap(minDistance, maxDistance)

  // An ad-hoc function equal to 0 for cosSun = minCosSun (because then
  // d = D and thus a = A), equal to 1 for cosSun = 1 (because then d =
  // minDistance and thus a = 0), and with a large slope around cosSun = 0, to
  // get more texture samples near the horizon.
  const cosSunCoord = getTextureCoordFromUnitRange(
    max(a.div(A).oneMinus(), 0).div(a.add(1)),
    parameters.scatteringTextureCosSunSize
  )
  const cosViewSunCoord = cosViewSun.add(1).mul(0.5)

  return vec4(cosViewSunCoord, cosSunCoord, cosViewCoord, radiusCoord)
})

export const getScattering = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getScattering',
  type: AbstractSpectrum,
  inputs: [
    { name: 'scatteringTexture', type: AbstractScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [
    scatteringTexture,
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  ],
  builder
) => {
  const { parameters } = AtmosphereContextBaseNode.get(builder)

  const coord = getScatteringTextureCoord(
    radius,
    cosView,
    cosSun,
    cosViewSun,
    viewRayIntersectsGround
  ).toVar()
  const texCoordX = coord.x
    .mul(parameters.scatteringTextureCosViewSunSize - 1)
    .toVar()
  const texX = floor(texCoordX).toVar()
  const lerp = texCoordX.sub(texX).toVar()
  const coord0 = vec3(
    texX.add(coord.y).div(parameters.scatteringTextureCosViewSunSize),
    coord.z,
    coord.w
  )
  const coord1 = vec3(
    texX.add(1).add(coord.y).div(parameters.scatteringTextureCosViewSunSize),
    coord.z,
    coord.w
  )
  return scatteringTexture
    .sample(coord0)
    .mul(lerp.oneMinus())
    .add(scatteringTexture.sample(coord1).mul(lerp)).rgb
})

export const getIrradianceTextureUV = /*#__PURE__*/ FnLayout({
  name: 'getIrradianceTextureUV',
  type: 'vec2',
  inputs: [
    { name: 'radius', type: Length },
    { name: 'cosSun', type: Dimensionless }
  ]
})(([radius, cosSun], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius } = context

  const radiusUnit = radius.remap(bottomRadius, topRadius)
  const cosSunUnit = cosSun.mul(0.5).add(0.5)
  return vec2(
    getTextureCoordFromUnitRange(
      cosSunUnit,
      parameters.irradianceTextureSize.x
    ),
    getTextureCoordFromUnitRange(radiusUnit, parameters.irradianceTextureSize.y)
  )
})

export const getIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'radius', type: Length },
    { name: 'cosSun', type: Dimensionless }
  ]
})(([irradianceTexture, radius, cosSun]) => {
  const uv = getIrradianceTextureUV(radius, cosSun)
  return irradianceTexture.sample(uv).rgb
})
