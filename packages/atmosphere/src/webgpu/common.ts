// Based on: https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/functions.glsl

/**
 * Copyright (c) 2017 Eric Bruneton
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
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
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Precomputed Atmospheric Scattering
 * Copyright (c) 2008 INRIA
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
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
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
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
  sub,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import {
  Fnv,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereParametersUniforms } from './AtmosphereParameters'
import {
  Area,
  Dimensionless,
  InverseSolidAngle,
  type AbstractScatteringTextureNode,
  type AbstractSpectrum,
  type DimensionlessSpectrum,
  type IrradianceSpectrum,
  type IrradianceTextureNode,
  type Length,
  type TransmittanceTextureNode
} from './dimensional'

export const clampCosine = /*#__PURE__*/ Fnv(
  (cosine: NodeObject<Dimensionless>): Node<Dimensionless> => {
    return clamp(cosine, -1, 1)
  }
).setLayout({
  name: 'clampCosine',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})

export const clampDistance = /*#__PURE__*/ Fnv(
  (distance: NodeObject<Length>): Node<Length> => {
    return max(distance, 0)
  }
).setLayout({
  name: 'clampDistance',
  type: Dimensionless,
  inputs: [{ name: 'cosine', type: Dimensionless }]
})

export const clampRadius = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>
  ): Node<Length> => {
    return clamp(radius, parameters.bottomRadius, parameters.topRadius)
  }
)

export const safeSqrt = /*#__PURE__*/ Fnv(
  (area: NodeObject<Area>): Node<Length> => {
    return sqrt(max(area, 0))
  }
).setLayout({
  name: 'safeSqrt',
  type: Dimensionless,
  inputs: [{ name: 'area', type: Area }]
})

export const distanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<Length> => {
    const discriminant = radius
      .pow2()
      .mul(cosView.pow2().sub(1))
      .add(parameters.topRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosView).add(safeSqrt(discriminant))
    )
  }
)

export const distanceToBottomAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<Length> => {
    const discriminant = radius
      .pow2()
      .mul(cosView.pow2().sub(1))
      .add(parameters.bottomRadius.pow2())
    return clampDistance(
      radius.negate().mul(cosView).sub(safeSqrt(discriminant))
    )
  }
)

export const rayIntersectsGround = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<'bool'> => {
    return cosView
      .lessThan(0)
      .and(
        radius
          .pow2()
          .mul(cosView.pow2().sub(1))
          .add(parameters.bottomRadius.pow2())
          .greaterThanEqual(0)
      )
  }
)

export const getTextureCoordFromUnitRange = /*#__PURE__*/ Fnv(
  (
    unit: NodeObject<'float'>,
    textureSize: NodeObject<'float'>
  ): Node<'float'> => {
    return div(0.5, textureSize).add(
      unit.mul(textureSize.reciprocal().oneMinus())
    )
  }
).setLayout({
  name: 'getTextureCoordFromUnitRange',
  type: 'float',
  inputs: [
    { name: 'unit', type: 'float' },
    { name: 'textureSize', type: 'float' }
  ]
})

export const getTransmittanceTextureUV = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<'vec2'> => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      parameters.topRadius.pow2().sub(parameters.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon for the view.
    const distanceToHorizon = safeSqrt(
      radius.pow2().sub(parameters.bottomRadius.pow2())
    ).toVar()

    // Distance to the top atmosphere boundary for the ray (radius, cosView),
    // and its minimum and maximum values over all cosView - obtained for
    // (radius, 1) and (radius, cosHorizon).
    const distanceToTop = distanceToTopAtmosphereBoundary(
      parameters,
      radius,
      cosView
    )
    const minDistance = parameters.topRadius.sub(radius).toVar()
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
  }
)

export const getTransmittanceToTopAtmosphereBoundary = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>
  ): Node<DimensionlessSpectrum> => {
    const uv = getTransmittanceTextureUV(parameters, radius, cosView)

    // Added for the precomputation stage in half-float precision. Manually
    // interpolate the transmittance instead of the optical depth.
    if (parameters.transmittancePrecisionLog) {
      // TODO: Separate to sampleLinear() function.
      const size = vec2(parameters.transmittanceTextureSize).toConst()
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
  }
)

export const getTransmittance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    transmittanceTexture: TransmittanceTextureNode,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    rayLength: NodeObject<Length>,
    rayIntersectsGround: NodeObject<'bool'>
  ): Node<DimensionlessSpectrum> => {
    const radiusEnd = clampRadius(
      parameters,
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
    If(rayIntersectsGround, () => {
      transmittance.assign(
        min(
          getTransmittanceToTopAtmosphereBoundary(
            parameters,
            transmittanceTexture,
            radiusEnd,
            cosViewEnd.negate()
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              parameters,
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
            parameters,
            transmittanceTexture,
            radius,
            cosView
          ).div(
            getTransmittanceToTopAtmosphereBoundary(
              parameters,
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
  }
)

export const getTransmittanceToSun = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    transmittanceTexture: TransmittanceTextureNode,
    radius: NodeObject<Length>,
    cosSun: NodeObject<Dimensionless>
  ): Node<DimensionlessSpectrum> => {
    const sinHorizon = parameters.bottomRadius.div(radius).toVar()
    const cosHorizon = sqrt(max(sinHorizon.pow2().oneMinus(), 0)).negate()
    return getTransmittanceToTopAtmosphereBoundary(
      parameters,
      transmittanceTexture,
      radius,
      cosSun
    ).mul(
      smoothstep(
        sinHorizon.negate().mul(parameters.sunAngularRadius),
        sinHorizon.mul(parameters.sunAngularRadius),
        cosSun.sub(cosHorizon)
      )
    )
  }
)

// Rayleigh phase function:
// p(\theta) = \frac{3}{16\pi}(1+\cos^2\theta)
export const rayleighPhaseFunction = /*#__PURE__*/ Fnv(
  (cosViewSun: NodeObject<Dimensionless>): Node<InverseSolidAngle> => {
    const k = div(3, mul(16, PI))
    return k.mul(cosViewSun.pow2().add(1))
  }
).setLayout({
  name: 'rayleighPhaseFunction',
  type: InverseSolidAngle,
  inputs: [{ name: 'cosViewSun', type: Dimensionless }]
})

// Cornette-Shanks phase function:
// p(g,\theta) = \frac{3}{8\pi}\frac{(1-g^2)(1+\cos^2\theta)}{(2+g^2)(1+g^2-2g\cos\theta)^{3/2}}
export const miePhaseFunction = /*#__PURE__*/ Fnv(
  (
    g: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>
  ): Node<InverseSolidAngle> => {
    const k = div(3, PI.mul(8)).mul(g.pow2().oneMinus()).div(g.pow2().add(2))
    return k
      .mul(cosViewSun.pow2().add(1))
      .div(g.pow2().sub(g.mul(2).mul(cosViewSun)).add(1).pow(1.5))
  }
).setLayout({
  name: 'miePhaseFunction',
  type: InverseSolidAngle,
  inputs: [
    { name: 'g', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless }
  ]
})

export const getScatteringTextureCoord = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    viewRayIntersectsGround: NodeObject<'bool'>
  ): Node<'vec4'> => {
    // Distance to top atmosphere boundary for a horizontal ray at ground level.
    const H = sqrt(
      parameters.topRadius.pow2().sub(parameters.bottomRadius.pow2())
    ).toVar()

    // Distance to the horizon for the view.
    const distanceToHorizon = safeSqrt(
      radius.pow2().sub(parameters.bottomRadius.pow2())
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
      .add(parameters.bottomRadius.pow2())
      .toVar()

    const cosViewCoord = float().toVar()
    If(viewRayIntersectsGround, () => {
      // Distance to the ground for the ray (radius, cosView), and its minimum
      // and maximum values over all cosView - obtained for (radius, -1) and
      // (radius, cosHorizon).
      const distance = radiusCosView.negate().sub(safeSqrt(discriminant))
      const minDistance = radius.sub(parameters.bottomRadius).toVar()
      const maxDistance = distanceToHorizon
      cosViewCoord.assign(
        sub(
          0.5,
          getTextureCoordFromUnitRange(
            select(
              maxDistance.equal(minDistance),
              0,
              distance.remap(minDistance, maxDistance)
            ),
            parameters.scatteringTextureCosViewSize / 2
          ).mul(0.5)
        )
      )
    }).Else(() => {
      // Distance to the top atmosphere boundary for the ray (radius, cosView),
      // and its minimum and maximum values over all cosView - obtained for
      // (radius, 1) and (radius, cosHorizon).
      const distance = radiusCosView
        .negate()
        .add(safeSqrt(discriminant.add(H.pow2())))
      const minDistance = parameters.topRadius.sub(radius).toVar()
      const maxDistance = distanceToHorizon.add(H)
      cosViewCoord.assign(
        getTextureCoordFromUnitRange(
          distance.remap(minDistance, maxDistance),
          parameters.scatteringTextureCosViewSize / 2
        )
          .mul(0.5)
          .add(0.5)
      )
    })

    const minDistance = parameters.topRadius
      .sub(parameters.bottomRadius)
      .toVar()
    const maxDistance = H
    const d = distanceToTopAtmosphereBoundary(
      parameters,
      parameters.bottomRadius,
      cosSun
    )
    const a = d.remap(minDistance, maxDistance).toVar()
    const D = distanceToTopAtmosphereBoundary(
      parameters,
      parameters.bottomRadius,
      parameters.minCosSun
    )
    const A = D.remap(minDistance, maxDistance)

    // An ad-hoc function equal to 0 for cosSun = minCosSun (because then
    // d = D and thus a = A), equal to 1 for cosSun = 1 (because then d =
    // minDistance and thus a = 0), and with a large slope around cosSun = 0, to
    // get more texture samples near the horizon.
    const cosSunCoord = getTextureCoordFromUnitRange(
      max(a.div(A).oneMinus(), 0).div(a.add(1)),
      parameters.scatteringTextureCosSunSize
    )
    const cosViewSunCoord = cosViewSun.add(1).div(2)

    return vec4(cosViewSunCoord, cosSunCoord, cosViewCoord, radiusCoord)
  }
)

export const getScattering = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    scatteringTexture: NodeObject<AbstractScatteringTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>
  ): Node<AbstractSpectrum> => {
    const coord = getScatteringTextureCoord(
      parameters,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
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
  }
)

export const getIrradianceTextureUV = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    radius: NodeObject<Length>,
    cosSun: NodeObject<Dimensionless>
  ): Node<'vec2'> => {
    const radiusUnit = radius.remap(
      parameters.bottomRadius,
      parameters.topRadius
    )
    const cosSunUnit = cosSun.mul(0.5).add(0.5)
    return vec2(
      getTextureCoordFromUnitRange(
        cosSunUnit,
        parameters.irradianceTextureSize.x
      ),
      getTextureCoordFromUnitRange(
        radiusUnit,
        parameters.irradianceTextureSize.y
      )
    )
  }
)

export const getIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersUniforms,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    radius: NodeObject<Length>,
    cosSun: NodeObject<Dimensionless>
  ): Node<IrradianceSpectrum> => {
    const uv = getIrradianceTextureUV(parameters, radius, cosSun)
    return irradianceTexture.sample(uv).rgb
  }
)
