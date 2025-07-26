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
  bool,
  float,
  floor,
  If,
  length,
  max,
  mul,
  normalize,
  not,
  PI,
  select,
  smoothstep,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4,
  type ShaderNodeObject
} from 'three/tsl'
import type { StructNode } from 'three/webgpu'

import { Fnv } from '@takram/three-geospatial/webgpu'

import { SCATTERING_TEXTURE_NU_SIZE } from '../constants'
import {
  clampRadius,
  getIrradiance,
  getScattering,
  getScatteringTextureCoord,
  getTransmittance,
  getTransmittanceToSun,
  getTransmittanceToTopAtmosphereBoundary,
  miePhaseFunction,
  rayIntersectsGround,
  rayleighPhaseFunction,
  safeSqrt
} from './common'
import type {
  AtmosphereParams,
  Bool,
  Direction,
  Float,
  IrradianceTexture,
  Length,
  Luminance3,
  Position,
  ReducedScatteringTexture,
  TransmittanceTexture,
  Vec2,
  Vec3,
  Vec4
} from './definitions'

export const getExtrapolatedSingleMieScattering = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams, scattering: Vec4): Vec3 => {
    // Algebraically this can never be negative, but rounding errors can produce
    // that effect for sufficiently short view rays.
    const singleMieScattering = vec3(0).toVar()
    // Avoid division by infinitesimal values.
    If(scattering.r.greaterThanEqual(1e-5), () => {
      singleMieScattering.assign(
        scattering.rgb
          .mul(scattering.a)
          .div(
            mul(
              scattering.r,
              atmosphere.rayleighScattering.r.div(atmosphere.mieScattering.r),
              atmosphere.mieScattering.div(atmosphere.rayleighScattering)
            )
          )
      )
    })
    return singleMieScattering
  }
)

const combinedScatteringStruct = /*#__PURE__*/ struct({
  scattering: 'vec3',
  singleMieScattering: 'vec3'
})
type CombinedScatteringStruct = ShaderNodeObject<StructNode>

export const getCombinedScattering = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    radius: Length,
    cosView: Float,
    cosSun: Float,
    cosViewSun: Float,
    rayIntersectsGround: Bool
  ): CombinedScatteringStruct => {
    const coord = getScatteringTextureCoord(
      atmosphere,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      rayIntersectsGround
    ).toVar()
    const texCoordX = coord.x.mul(SCATTERING_TEXTURE_NU_SIZE - 1).toVar()
    const texX = floor(texCoordX).toVar()
    const lerp = texCoordX.sub(texX).toVar()
    const coord0 = vec3(
      texX.add(coord.y).div(SCATTERING_TEXTURE_NU_SIZE),
      coord.z,
      coord.w
    ).toVar()
    const coord1 = vec3(
      texX.add(1).add(coord.y).div(SCATTERING_TEXTURE_NU_SIZE),
      coord.z,
      coord.w
    ).toVar()

    const scattering = vec3().toVar()
    const singleMieScattering = vec3().toVar()
    if (atmosphere.options.combinedScatteringTextures) {
      const combinedScattering = scatteringTexture
        .sample(coord0)
        .mul(lerp.oneMinus())
        .add(scatteringTexture.sample(coord1).mul(lerp))
        .rgb.toVar()
      scattering.assign(combinedScattering)
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(atmosphere, combinedScattering)
      )
    } else {
      scattering.assign(
        scatteringTexture
          .sample(coord0)
          .mul(lerp.oneMinus())
          .add(scatteringTexture.sample(coord1).mul(lerp)).rgb
      )
      singleMieScattering.assign(
        singleMieScatteringTexture
          .sample(coord0)
          .mul(lerp.oneMinus())
          .add(singleMieScatteringTexture.sample(coord1).mul(lerp)).rgb
      )
    }
    return combinedScatteringStruct(scattering, singleMieScattering)
  }
)

const radianceTransferStruct = /*#__PURE__*/ struct({
  radiance: 'vec3',
  transmittance: 'vec3'
})
type RadianceTransferStruct = ShaderNodeObject<StructNode>

export const getSkyRadiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    higherOrderScatteringTexture: ReducedScatteringTexture,
    camera: Position,
    viewRay: Direction,
    shadowLength: Length,
    sunDirection: Direction
  ): RadianceTransferStruct => {
    // Clamp the viewer at the bottom atmosphere boundary for rendering points
    // below it.
    const radius = length(camera).toVar()
    const movedCamera = camera.toVar()
    if (atmosphere.options.constrainCameraAboveGround) {
      If(radius.lessThan(atmosphere.bottomRadius), () => {
        radius.assign(atmosphere.bottomRadius)
        movedCamera.assign(normalize(camera).mul(radius))
      })
    }

    // Compute the distance to the top atmosphere boundary along the view ray,
    // assuming the viewer is in space.
    const radiusCosView = movedCamera.dot(viewRay).toVar()
    const distanceToTop = radiusCosView
      .negate()
      .sub(
        safeSqrt(
          radiusCosView
            .pow2()
            .sub(radius.pow2())
            .add(atmosphere.topRadius.pow2())
        )
      )
      .toVar()

    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // If the viewer is in space and the view ray intersects the atmosphere,
    // move the viewer to the top atmosphere boundary along the view ray. If the
    // view ray does not intersect the atmosphere, simply return zero radiance.
    If(distanceToTop.greaterThan(0), () => {
      movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
      radius.assign(atmosphere.topRadius)
      radiusCosView.addAssign(distanceToTop)

      // Compute the scattering parameters needed for the texture lookups.
      const cosView = radiusCosView.div(radius).toVar()
      const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
      const cosViewSun = viewRay.dot(sunDirection).toVar()

      const viewRayIntersectsGround = bool(false).toVar()
      if (atmosphere.options.hideGround) {
        viewRayIntersectsGround.assign(
          rayIntersectsGround(atmosphere, radius, cosView)
        )
      }
      transmittance.assign(
        select(
          viewRayIntersectsGround,
          vec3(0),
          getTransmittanceToTopAtmosphereBoundary(
            atmosphere,
            transmittanceTexture,
            radius,
            cosView
          )
        )
      )

      const scattering = vec3().toVar()
      const singleMieScattering = vec3().toVar()

      If(shadowLength.equal(0), () => {
        const combinedScattering = getCombinedScattering(
          atmosphere,
          scatteringTexture,
          singleMieScatteringTexture,
          radius,
          cosView,
          cosSun,
          cosViewSun,
          viewRayIntersectsGround
        ).toVar()
        scattering.assign(combinedScattering.get('scattering'))
        singleMieScattering.assign(
          combinedScattering.get('singleMieScattering')
        )
      }).Else(() => {
        // Case of light shafts, we omit the scattering between the camera and
        // the point at shadowLength.
        const radiusP = clampRadius(
          atmosphere,
          sqrt(
            shadowLength
              .pow2()
              .add(mul(2, radius, cosView, shadowLength))
              .add(radius.pow2())
          )
        ).toVar()
        const cosViewP = radius
          .mul(cosView)
          .add(shadowLength)
          .div(radiusP)
          .toVar()
        const cosSunP = radius
          .mul(cosSun)
          .add(shadowLength.mul(cosViewSun))
          .div(radiusP)
          .toVar()

        const combinedScattering = getCombinedScattering(
          atmosphere,
          scatteringTexture,
          singleMieScatteringTexture,
          radiusP,
          cosViewP,
          cosSunP,
          cosViewSun,
          viewRayIntersectsGround
        ).toVar()
        scattering.assign(combinedScattering.get('scattering'))
        singleMieScattering.assign(
          combinedScattering.get('singleMieScattering')
        )

        const shadowTransmittance = getTransmittance(
          atmosphere,
          transmittanceTexture,
          radius,
          cosView,
          shadowLength,
          viewRayIntersectsGround
        ).toVar()

        // Occlude only single Rayleigh scattering by the shadow.
        if (atmosphere.options.higherOrderScatteringTexture) {
          const higherOrderScattering = getScattering(
            atmosphere,
            higherOrderScatteringTexture,
            radiusP,
            cosViewP,
            cosSunP,
            cosViewSun,
            viewRayIntersectsGround
          ).toVar()
          scattering.assign(
            scattering
              .sub(higherOrderScattering)
              .mul(shadowTransmittance)
              .add(higherOrderScattering)
          )
        } else {
          scattering.assign(scattering.mul(shadowTransmittance))
        }
        singleMieScattering.assign(singleMieScattering.mul(shadowTransmittance))
      })

      // Finally combine the multiple Rayleigh scattering and the single Mie
      // scattering, applying their phase functions.
      radiance.assign(
        scattering
          .mul(rayleighPhaseFunction(cosViewSun))
          .add(
            singleMieScattering.mul(
              miePhaseFunction(atmosphere.miePhaseFunctionG, cosViewSun)
            )
          )
      )
    })

    return radianceTransferStruct(radiance, transmittance)
  }
)

const getSkyRadianceToPointImpl = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    higherOrderScatteringTexture: ReducedScatteringTexture,
    camera: Position,
    point: Position,
    shadowLength: Length,
    sunDirection: Direction
  ): RadianceTransferStruct => {
    // Compute the distance to the top atmosphere boundary along the view ray,
    // assuming the viewer is in space.
    const viewRay = normalize(point.sub(camera)).toVar()
    const radius = length(camera).toVar()
    const radiusCosView = camera.dot(viewRay).toVar()
    const distanceToTop = radiusCosView
      .negate()
      .sub(
        safeSqrt(
          radiusCosView
            .pow2()
            .sub(radius.pow2())
            .add(atmosphere.topRadius.pow2())
        )
      )
      .toVar()

    // If the viewer is in space and the view ray intersects the atmosphere,
    // move the viewer to the top atmosphere boundary along the view ray.
    const movedCamera = camera.toVar()
    If(distanceToTop.greaterThan(0), () => {
      movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
      radius.assign(atmosphere.topRadius)
      radiusCosView.addAssign(distanceToTop)
    })

    // Compute the scattering parameters for the first texture lookup.
    const cosView = radiusCosView.div(radius).toVar()
    const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
    const cosViewSun = viewRay.dot(sunDirection).toVar()
    const distanceToPoint = length(point.sub(movedCamera)).toVar()
    const viewRayIntersectsGround = rayIntersectsGround(
      atmosphere,
      radius,
      cosView
    ).toVar()

    // Hack to avoid rendering artifacts near the horizon, due to finite
    // atmosphere texture resolution and finite floating point precision.
    // See: https://github.com/ebruneton/precomputed_atmospheric_scattering/pull/32
    If(not(viewRayIntersectsGround), () => {
      const cosHorizon = safeSqrt(
        atmosphere.bottomRadius.pow2().div(radius.pow2()).oneMinus()
      )
        .negate()
        .toVar()
      const eps = float(0.004).toConst()
      cosView.assign(max(cosView, cosHorizon.add(eps)))
    })

    const transmittance = getTransmittance(
      atmosphere,
      transmittanceTexture,
      radius,
      cosView,
      distanceToPoint,
      viewRayIntersectsGround
    ).toVar()

    const combinedScattering = getCombinedScattering(
      atmosphere,
      scatteringTexture,
      singleMieScatteringTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      viewRayIntersectsGround
    ).toVar()
    const scattering = combinedScattering.get('scattering')
    const singleMieScattering = combinedScattering.get('singleMieScattering')

    // Compute the scattering parameters for the second texture lookup.
    // If shadowLength is not 0 (case of light shafts), we want to ignore the
    // scattering along the last shadowLength meters of the view ray, which we
    // do by subtracting shadowLength from distanceToPoint.
    distanceToPoint.assign(distanceToPoint.sub(shadowLength).max(0))
    const radiusP = clampRadius(
      atmosphere,
      sqrt(
        distanceToPoint
          .pow2()
          .add(mul(2, radius, cosView, distanceToPoint))
          .add(radius.pow2())
      )
    ).toVar()
    const cosViewP = radius
      .mul(cosView)
      .add(distanceToPoint)
      .div(radiusP)
      .toVar()
    const cosSunP = radius
      .mul(cosSun)
      .add(distanceToPoint.mul(cosViewSun))
      .div(radiusP)
      .toVar()
    const combinedScatteringP = getCombinedScattering(
      atmosphere,
      scatteringTexture,
      singleMieScatteringTexture,
      radiusP,
      cosViewP,
      cosSunP,
      cosViewSun,
      viewRayIntersectsGround
    ).toVar()
    const scatteringP = combinedScatteringP.get('scattering')
    const singleMieScatteringP = combinedScatteringP.get('singleMieScattering')

    // Combine the lookup to get the scattering between camera and point.
    const shadowTransmittance = transmittance.toVar()
    If(shadowLength.greaterThan(0), () => {
      shadowTransmittance.assign(
        getTransmittance(
          atmosphere,
          transmittanceTexture,
          radius,
          cosView,
          distanceToPoint,
          viewRayIntersectsGround
        )
      )
    })
    if (atmosphere.options.higherOrderScatteringTexture) {
      // Occlude only the single Rayleigh scattering by the shadow.
      const higherOrderScattering = getScattering(
        atmosphere,
        higherOrderScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        viewRayIntersectsGround
      ).toVar()
      const singleScattering = scattering.sub(higherOrderScattering).toVar()
      const higherOrderScatteringP = getScattering(
        atmosphere,
        higherOrderScatteringTexture,
        radiusP,
        cosViewP,
        cosSunP,
        cosViewSun,
        viewRayIntersectsGround
      ).toVar()
      const singleScatteringP = scatteringP.sub(higherOrderScatteringP)
      scattering.assign(
        singleScattering
          .sub(shadowTransmittance.mul(singleScatteringP))
          .add(
            higherOrderScattering.sub(transmittance.mul(higherOrderScatteringP))
          )
      )
    } else {
      scattering.assign(scattering.sub(shadowTransmittance.mul(scatteringP)))
    }

    singleMieScattering.assign(
      singleMieScattering.sub(shadowTransmittance.mul(singleMieScatteringP))
    )
    if (atmosphere.options.combinedScatteringTextures) {
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(
          atmosphere,
          vec4(scattering, singleMieScattering.r)
        )
      )
    }

    // Hack to avoid rendering artifacts when the sun is below the horizon.
    singleMieScattering.assign(
      singleMieScattering.mul(smoothstep(0, 0.01, cosSun))
    )

    // Finally combine the multiple Rayleigh scattering and the single Mie
    // scattering, applying their phase functions.
    scattering.assign(
      scattering
        .mul(rayleighPhaseFunction(cosViewSun))
        .add(
          singleMieScattering.mul(
            miePhaseFunction(atmosphere.miePhaseFunctionG, cosViewSun)
          )
        )
    )
    return radianceTransferStruct(scattering, transmittance)
  }
)

// Returns the distance of the point on the ray from the planet origin.
export const distanceToClosestPointOnRay = /*#__PURE__*/ Fnv(
  (camera: Position, point: Position): Length => {
    const ray = point.sub(camera).toVar()
    const t = camera.dot(ray).negate().div(ray.dot(ray)).saturate()
    return length(camera.add(t.mul(ray)))
  }
)

export const raySphereIntersections = /*#__PURE__*/ Fnv(
  (camera: Position, direction: Direction, radius: Length): Vec2 => {
    const b = direction.dot(camera).mul(2).toVar()
    const c = camera.dot(camera).sub(radius.pow2())
    const discriminant = b.pow2().sub(mul(4, c))
    const Q = sqrt(discriminant).toVar()
    return vec2(b.negate().sub(Q), b.negate().add(Q)).mul(0.5)
  }
)

const raySegmentStruct = /*#__PURE__*/ struct({
  camera: 'vec3',
  point: 'vec3'
})
type RaySegmentStruct = ShaderNodeObject<StructNode>

// Clip the view ray at the bottom atmosphere boundary.
export const clipRayAtBottomAtmosphere = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    camera: Position,
    point: Position
  ): RaySegmentStruct => {
    const eps = float(0).toConst()
    const bottomRadius = atmosphere.bottomRadius.add(eps).toVar()
    const cameraBelow = length(camera).lessThan(bottomRadius).toVar()
    const pointBelow = length(point).lessThan(bottomRadius).toVar()

    const viewRay = normalize(point.sub(camera)).toVar()
    const t = raySphereIntersections(camera, viewRay, bottomRadius)
    const intersection = camera.add(viewRay.mul(select(cameraBelow, t.y, t.x)))

    // The ray segment degenerates when the both camera and point are below the
    // bottom atmosphere boundary.
    const clippedCamera = select(cameraBelow, intersection, camera)
    const clippedPoint = select(pointBelow, intersection, point)
    return raySegmentStruct(clippedCamera, clippedPoint)
  }
)

export const getSkyRadianceToPoint = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    higherOrderScatteringTexture: ReducedScatteringTexture,
    camera: Position,
    point: Position,
    shadowLength: Length,
    sunDirection: Direction
  ): RadianceTransferStruct => {
    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // Avoid artifacts when the ray does not intersect the top atmosphere
    // boundary.
    const distanceToRay = distanceToClosestPointOnRay(camera, point)
    If(distanceToRay.lessThan(atmosphere.topRadius), () => {
      // Clip the ray at the bottom atmosphere boundary for rendering points
      // below it.
      const clippedRaySegment = clipRayAtBottomAtmosphere(
        atmosphere,
        camera,
        point
      ).toVar()
      const clippedCamera = clippedRaySegment.get('camera')
      const clippedPoint = clippedRaySegment.get('point')

      If(not(clippedCamera.equal(clippedPoint)), () => {
        const result = getSkyRadianceToPointImpl(
          atmosphere,
          transmittanceTexture,
          scatteringTexture,
          singleMieScatteringTexture,
          higherOrderScatteringTexture,
          clippedCamera,
          clippedPoint,
          shadowLength,
          sunDirection
        ).toVar()

        radiance.assign(result.get('radiance'))
        transmittance.assign(result.get('transmittance'))
      })
    })

    return radianceTransferStruct(radiance, transmittance)
  }
)

const sunAndSkyIrradianceStruct = /*#__PURE__*/ struct({
  sunIrradiance: 'vec3',
  skyIrradiance: 'vec3'
})
type SunAndSkyIrradianceStruct = ShaderNodeObject<StructNode>

export const getSunAndSkyIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    point: Position,
    normal: Direction,
    sunDirection: Direction
  ): SunAndSkyIrradianceStruct => {
    const radius = length(point).toVar()
    const cosSun = point.dot(sunDirection).div(radius).toVar()

    // Direct irradiance.
    const sunIrradiance = atmosphere.solarIrradiance.mul(
      getTransmittanceToSun(atmosphere, transmittanceTexture, radius, cosSun),
      normal.dot(sunDirection).max(0)
    )

    // Indirect irradiance (approximated if the surface is not horizontal).
    const skyIrradiance = getIrradiance(
      atmosphere,
      irradianceTexture,
      radius,
      cosSun
    ).mul(normal.dot(point).div(radius).add(1).mul(0.5))

    return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
  }
)

export const getSunAndSkyScalarIrradiance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    point: Position,
    sunDirection: Direction
  ): SunAndSkyIrradianceStruct => {
    const radius = length(point).toVar()
    const cosSun = point.dot(sunDirection).div(radius).toVar()

    // Indirect irradiance. Integral over sphere yields 2π.
    const skyIrradiance = getIrradiance(
      atmosphere,
      irradianceTexture,
      radius,
      cosSun
    ).mul(2, PI)

    // Direct irradiance. Omit the cosine term.
    const sunIrradiance = atmosphere.solarIrradiance.mul(
      getTransmittanceToSun(atmosphere, transmittanceTexture, radius, cosSun)
    )

    return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
  }
)

export const getSolarLuminance = /*#__PURE__*/ Fnv(
  (atmosphere: AtmosphereParams): Luminance3 => {
    return mul(
      PI,
      atmosphere.sunAngularRadius.pow2(),
      atmosphere.sunRadianceToLuminance
    )
  }
)

const luminanceTransferStruct = /*#__PURE__*/ struct({
  luminance: 'vec3',
  transmittance: 'vec3'
})
type LuminanceTransferStruct = ShaderNodeObject<StructNode>

export const getSkyLuminance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    higherOrderScatteringTexture: ReducedScatteringTexture,
    camera: Position,
    viewRay: Direction,
    shadowLength: Length,
    sunDirection: Direction
  ): LuminanceTransferStruct => {
    const radianceTransfer = getSkyRadiance(
      atmosphere,
      transmittanceTexture,
      scatteringTexture,
      singleMieScatteringTexture,
      higherOrderScatteringTexture,
      camera,
      viewRay,
      shadowLength,
      sunDirection
    ).toVar()

    const luminance = radianceTransfer
      .get('radiance')
      .mul(atmosphere.skyRadianceToLuminance)
    return luminanceTransferStruct(
      luminance,
      radianceTransfer.get('transmittance')
    )
  }
)

export const getSkyLuminanceToPoint = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    scatteringTexture: ReducedScatteringTexture,
    singleMieScatteringTexture: ReducedScatteringTexture,
    higherOrderScatteringTexture: ReducedScatteringTexture,
    camera: Position,
    point: Position,
    shadowLength: Length,
    sunDirection: Direction
  ): LuminanceTransferStruct => {
    const radianceTransfer = getSkyRadianceToPoint(
      atmosphere,
      transmittanceTexture,
      scatteringTexture,
      singleMieScatteringTexture,
      higherOrderScatteringTexture,
      camera,
      point,
      shadowLength,
      sunDirection
    ).toVar()

    const luminance = radianceTransfer
      .get('radiance')
      .mul(atmosphere.skyRadianceToLuminance)
    return luminanceTransferStruct(
      luminance,
      radianceTransfer.get('transmittance')
    )
  }
)

const sunAndSkyIlluminanceStruct = /*#__PURE__*/ struct({
  sunIlluminance: 'vec3',
  skyIlluminance: 'vec3'
})
type SunAndSkyIlluminanceStruct = ShaderNodeObject<StructNode>

export const getSunAndSkyIlluminance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    point: Position,
    normal: Direction,
    sunDirection: Direction
  ): SunAndSkyIlluminanceStruct => {
    const sunSkyIrradiance = getSunAndSkyIrradiance(
      atmosphere,
      transmittanceTexture,
      irradianceTexture,
      point,
      normal,
      sunDirection
    ).toVar()

    const sunIlluminance = sunSkyIrradiance
      .get('sunIrradiance')
      .mul(atmosphere.sunRadianceToLuminance)
    const skyIlluminance = sunSkyIrradiance
      .get('skyIrradiance')
      .mul(atmosphere.skyRadianceToLuminance)
    return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
  }
)

// Added for the cloud particles.
export const getSunAndSkyScalarIlluminance = /*#__PURE__*/ Fnv(
  (
    atmosphere: AtmosphereParams,
    transmittanceTexture: TransmittanceTexture,
    irradianceTexture: IrradianceTexture,
    point: Position,
    sunDirection: Direction
  ): SunAndSkyIlluminanceStruct => {
    const sunSkyIrradiance = getSunAndSkyScalarIrradiance(
      atmosphere,
      transmittanceTexture,
      irradianceTexture,
      point,
      sunDirection
    ).toVar()

    const sunIlluminance = sunSkyIrradiance
      .get('sunIrradiance')
      .mul(atmosphere.sunRadianceToLuminance)
    const skyIlluminance = sunSkyIrradiance
      .get('skyIrradiance')
      .mul(atmosphere.skyRadianceToLuminance)
    return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
  }
)
