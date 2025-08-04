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
  add,
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
  vec4
} from 'three/tsl'

import {
  Fnv,
  type Node,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereParametersNodes } from './AtmosphereParameters'
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
import {
  DimensionlessSpectrum,
  Illuminance3,
  IrradianceSpectrum,
  Luminance3,
  Position,
  RadianceSpectrum,
  type Dimensionless,
  type Direction,
  type IrradianceTextureNode,
  type Length,
  type ReducedScatteringTextureNode,
  type TransmittanceTextureNode
} from './dimensional'

const getExtrapolatedSingleMieScattering = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    scattering: NodeObject<'vec4'>
  ): Node<IrradianceSpectrum> => {
    // Algebraically this can never be negative, but rounding errors can produce
    // that effect for sufficiently short view rays.
    const singleMieScattering = vec3(0).toVar()
    // Avoid division by infinitesimal values.
    If(scattering.r.greaterThanEqual(1e-5), () => {
      const { rayleighScattering, mieScattering } = parameters
      singleMieScattering.assign(
        scattering.rgb
          .mul(scattering.a)
          .div(scattering.r)
          .mul(rayleighScattering.r.div(mieScattering.r))
          .mul(mieScattering.div(rayleighScattering))
      )
    })
    return singleMieScattering
  }
)

const combinedScatteringStruct = /*#__PURE__*/ struct({
  scattering: IrradianceSpectrum,
  singleMieScattering: IrradianceSpectrum
})
type CombinedScatteringStruct = ReturnType<typeof combinedScatteringStruct>

const getCombinedScattering = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    scatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    radius: NodeObject<Length>,
    cosView: NodeObject<Dimensionless>,
    cosSun: NodeObject<Dimensionless>,
    cosViewSun: NodeObject<Dimensionless>,
    rayIntersectsGround: NodeObject<'bool'>
  ): CombinedScatteringStruct => {
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
    ).toVar()
    const coord1 = vec3(
      texX.add(1).add(coord.y).div(parameters.scatteringTextureCosViewSunSize),
      coord.z,
      coord.w
    ).toVar()

    const scattering = vec3().toVar()
    const singleMieScattering = vec3().toVar()
    if (parameters.combinedScatteringTextures) {
      const combinedScattering = add(
        scatteringTexture.sample(coord0).mul(lerp.oneMinus()),
        scatteringTexture.sample(coord1).mul(lerp)
      ).toVar()
      scattering.assign(combinedScattering.rgb)
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(parameters, combinedScattering)
      )
    } else {
      scattering.assign(
        add(
          scatteringTexture.sample(coord0).mul(lerp.oneMinus()),
          scatteringTexture.sample(coord1).mul(lerp)
        ).rgb
      )
      singleMieScattering.assign(
        add(
          singleMieScatteringTexture.sample(coord0).mul(lerp.oneMinus()),
          singleMieScatteringTexture.sample(coord1).mul(lerp)
        ).rgb
      )
    }
    return combinedScatteringStruct(scattering, singleMieScattering)
  }
)

const radianceTransferStruct = /*#__PURE__*/ struct({
  radiance: RadianceSpectrum,
  transmittance: DimensionlessSpectrum
})
type RadianceTransferStruct = ReturnType<typeof radianceTransferStruct>

interface SkyRadianceOptions {
  constrainCamera?: boolean
  showGround?: boolean
}

const getSkyRadiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    scatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    higherOrderScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    camera: NodeObject<Position>,
    viewRay: NodeObject<Direction>,
    shadowLength: NodeObject<Length>,
    sunDirection: NodeObject<Direction>,
    { constrainCamera = true, showGround = true }: SkyRadianceOptions = {}
  ): RadianceTransferStruct => {
    // Clamp the viewer at the bottom atmosphere boundary for rendering points
    // below it.
    const radius = length(camera).toVar()
    const movedCamera = camera.toVar()
    if (constrainCamera) {
      If(radius.lessThan(parameters.bottomRadius), () => {
        radius.assign(parameters.bottomRadius)
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
            .add(parameters.topRadius.pow2())
        )
      )
      .toVar()

    // If the viewer is in space and the view ray intersects the atmosphere,
    // move the viewer to the top atmosphere boundary along the view ray.
    If(distanceToTop.greaterThan(0), () => {
      movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
      radius.assign(parameters.topRadius)
      radiusCosView.addAssign(distanceToTop)
    })

    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // If the view ray does not intersect the atmosphere, simply return 0.
    If(radius.lessThanEqual(parameters.topRadius), () => {
      // Compute the scattering parameters needed for the texture lookups.
      const cosView = radiusCosView.div(radius).toVar()
      const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
      const cosViewSun = viewRay.dot(sunDirection).toVar()

      const viewRayIntersectsGround = bool(false).toVar()
      if (showGround) {
        viewRayIntersectsGround.assign(
          rayIntersectsGround(parameters, radius, cosView)
        )
      }
      transmittance.assign(
        select(
          viewRayIntersectsGround,
          vec3(0),
          getTransmittanceToTopAtmosphereBoundary(
            parameters,
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
          parameters,
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
          parameters,
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
          parameters,
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
          parameters,
          transmittanceTexture,
          radius,
          cosView,
          shadowLength,
          viewRayIntersectsGround
        ).toVar()

        // Occlude only single Rayleigh scattering by the shadow.
        if (parameters.higherOrderScatteringTexture) {
          const higherOrderScattering = getScattering(
            parameters,
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
              miePhaseFunction(parameters.miePhaseFunctionG, cosViewSun)
            )
          )
      )
    })

    return radianceTransferStruct(radiance, transmittance)
  }
)

const getSkyRadianceToPointImpl = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    scatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    higherOrderScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    camera: NodeObject<Position>,
    point: NodeObject<Position>,
    shadowLength: NodeObject<Length>,
    sunDirection: NodeObject<Direction>
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
            .add(parameters.topRadius.pow2())
        )
      )
      .toVar()

    // If the viewer is in space and the view ray intersects the atmosphere,
    // move the viewer to the top atmosphere boundary along the view ray.
    const movedCamera = camera.toVar()
    If(distanceToTop.greaterThan(0), () => {
      movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
      radius.assign(parameters.topRadius)
      radiusCosView.addAssign(distanceToTop)
    })

    // Compute the scattering parameters for the first texture lookup.
    const cosView = radiusCosView.div(radius).toVar()
    const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
    const cosViewSun = viewRay.dot(sunDirection).toVar()
    const distanceToPoint = movedCamera.distance(point).toVar()
    const viewRayIntersectsGround = rayIntersectsGround(
      parameters,
      radius,
      cosView
    ).toVar()

    // Hack to avoid rendering artifacts near the horizon, due to finite
    // atmosphere texture resolution and finite floating point precision.
    If(not(viewRayIntersectsGround), () => {
      const cosHorizon = safeSqrt(
        parameters.bottomRadius.pow2().div(radius.pow2()).oneMinus()
      )
        .negate()
        .toVar()
      const eps = float(0.004).toConst()
      cosView.assign(max(cosView, cosHorizon.add(eps)))
    })

    const transmittance = getTransmittance(
      parameters,
      transmittanceTexture,
      radius,
      cosView,
      distanceToPoint,
      viewRayIntersectsGround
    ).toVar()

    const combinedScattering = getCombinedScattering(
      parameters,
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
      parameters,
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
      parameters,
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
          parameters,
          transmittanceTexture,
          radius,
          cosView,
          distanceToPoint,
          viewRayIntersectsGround
        )
      )
    })
    if (parameters.higherOrderScatteringTexture) {
      // Occlude only the single Rayleigh scattering by the shadow.
      const higherOrderScattering = getScattering(
        parameters,
        higherOrderScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        viewRayIntersectsGround
      ).toVar()
      const singleScattering = scattering.sub(higherOrderScattering).toVar()
      const higherOrderScatteringP = getScattering(
        parameters,
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
    if (parameters.combinedScatteringTextures) {
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(
          parameters,
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
            miePhaseFunction(parameters.miePhaseFunctionG, cosViewSun)
          )
        )
    )
    return radianceTransferStruct(scattering, transmittance)
  }
)

// Returns the distance of the point on the ray from the planet origin.
const distanceToClosestPointOnRay = /*#__PURE__*/ Fnv(
  (camera: NodeObject<Position>, point: NodeObject<Position>): Node<Length> => {
    const ray = point.sub(camera).toVar()
    const t = camera.dot(ray).negate().div(ray.dot(ray)).saturate()
    return length(camera.add(t.mul(ray)))
  }
)

const raySphereIntersections = /*#__PURE__*/ Fnv(
  (
    camera: NodeObject<Position>,
    direction: NodeObject<Direction>,
    radius: NodeObject<Length>
  ): Node<'vec2'> => {
    const b = direction.dot(camera).mul(2).toVar()
    const c = camera.dot(camera).sub(radius.pow2())
    const discriminant = b.pow2().sub(c.mul(4))
    const Q = sqrt(discriminant).toVar()
    return vec2(b.negate().sub(Q), b.negate().add(Q)).mul(0.5)
  }
)

const raySegmentStruct = /*#__PURE__*/ struct({
  camera: Position,
  point: Position,
  degenerate: 'bool'
})
type RaySegmentStruct = ReturnType<typeof raySegmentStruct>

// Clip the view ray at the bottom atmosphere boundary.
const clipRayAtBottomAtmosphere = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    camera: NodeObject<Position>,
    point: NodeObject<Position>
  ): RaySegmentStruct => {
    const eps = float(0).toConst()
    const bottomRadius = parameters.bottomRadius.add(eps).toVar()
    const cameraBelow = length(camera).lessThan(bottomRadius).toVar()
    const pointBelow = length(point).lessThan(bottomRadius).toVar()

    const viewRay = normalize(point.sub(camera)).toVar()
    const t = raySphereIntersections(camera, viewRay, bottomRadius)
    const intersection = camera.add(viewRay.mul(select(cameraBelow, t.y, t.x)))

    // The ray segment degenerates when the both camera and point are below the
    // bottom atmosphere boundary.
    return raySegmentStruct(
      select(cameraBelow, intersection, camera),
      select(pointBelow, intersection, point),
      cameraBelow.and(pointBelow)
    )
  }
)

const getSkyRadianceToPoint = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    scatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    singleMieScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    higherOrderScatteringTexture: NodeObject<ReducedScatteringTextureNode>,
    camera: NodeObject<Position>,
    point: NodeObject<Position>,
    shadowLength: NodeObject<Length>,
    sunDirection: NodeObject<Direction>
  ): RadianceTransferStruct => {
    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // Avoid artifacts when the ray does not intersect the top atmosphere
    // boundary.
    const distanceToRay = distanceToClosestPointOnRay(camera, point)
    If(distanceToRay.lessThan(parameters.topRadius), () => {
      // Clip the ray at the bottom atmosphere boundary for rendering points
      // below it.
      const clippedRaySegment = clipRayAtBottomAtmosphere(
        parameters,
        camera,
        point
      ).toVar()
      const clippedCamera = clippedRaySegment.get('camera')
      const clippedPoint = clippedRaySegment.get('point')
      const degenerate = clippedRaySegment.get('degenerate')

      If(not(degenerate), () => {
        const result = getSkyRadianceToPointImpl(
          parameters,
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
  sunIrradiance: IrradianceSpectrum,
  skyIrradiance: IrradianceSpectrum
})
type SunAndSkyIrradianceStruct = ReturnType<typeof sunAndSkyIrradianceStruct>

const getSunAndSkyIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    point: NodeObject<Position>,
    normal: NodeObject<Direction>,
    sunDirection: NodeObject<Direction>
  ): SunAndSkyIrradianceStruct => {
    const radius = length(point).toVar()
    const cosSun = point.dot(sunDirection).div(radius).toVar()

    // Direct irradiance.
    const sunIrradiance = parameters.solarIrradiance.mul(
      getTransmittanceToSun(parameters, transmittanceTexture, radius, cosSun),
      normal.dot(sunDirection).max(0)
    )

    // Indirect irradiance (approximated if the surface is not horizontal).
    const skyIrradiance = getIrradiance(
      parameters,
      irradianceTexture,
      radius,
      cosSun
    ).mul(normal.dot(point).div(radius).add(1).mul(0.5))

    return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
  }
)

const getSkyIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    point: NodeObject<Position>,
    normal: NodeObject<Direction>,
    sunDirection: NodeObject<Direction>
  ): Node<IrradianceSpectrum> => {
    const radius = length(point).toVar()
    const cosSun = point.dot(sunDirection).div(radius).toVar()

    // Indirect irradiance (approximated if the surface is not horizontal).
    return getIrradiance(parameters, irradianceTexture, radius, cosSun).mul(
      normal.dot(point).div(radius).add(1).mul(0.5)
    )
  }
)

const getSunAndSkyScalarIrradiance = /*#__PURE__*/ Fnv(
  (
    parameters: AtmosphereParametersNodes,
    transmittanceTexture: NodeObject<TransmittanceTextureNode>,
    irradianceTexture: NodeObject<IrradianceTextureNode>,
    point: NodeObject<Position>,
    sunDirection: NodeObject<Direction>
  ): SunAndSkyIrradianceStruct => {
    const radius = length(point).toVar()
    const cosSun = point.dot(sunDirection).div(radius).toVar()

    // Indirect irradiance. Integral over sphere yields 2π.
    const skyIrradiance = getIrradiance(
      parameters,
      irradianceTexture,
      radius,
      cosSun
    ).mul(2, PI)

    // Direct irradiance. Omit the cosine term.
    const sunIrradiance = parameters.solarIrradiance.mul(
      getTransmittanceToSun(parameters, transmittanceTexture, radius, cosSun)
    )

    return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
  }
)

export const getSolarLuminance = /*#__PURE__*/ Fnv(
  (atmosphereLUT: AtmosphereLUTNode): Node<Luminance3> => {
    const parameters = atmosphereLUT.parameters.getNodes()
    return mul(
      PI,
      parameters.sunAngularRadius.pow2(),
      parameters.sunRadianceToLuminance.mul(parameters.luminanceScale)
    )
  }
)

const luminanceTransferStruct = /*#__PURE__*/ struct({
  luminance: Luminance3,
  transmittance: DimensionlessSpectrum
})
type LuminanceTransferStruct = ReturnType<typeof luminanceTransferStruct>

export interface SkyLuminanceOptions extends SkyRadianceOptions {}

export const getSkyLuminance = /*#__PURE__*/ Fnv(
  (
    atmosphereLUT: AtmosphereLUTNode,
    camera: NodeObject<Position>,
    viewRay: NodeObject<Direction>,
    shadowLength: NodeObject<Length>,
    sunDirection: NodeObject<Direction>,
    options?: SkyLuminanceOptions
  ): LuminanceTransferStruct => {
    const parameters = atmosphereLUT.parameters.getNodes()
    const radianceTransfer = getSkyRadiance(
      parameters,
      atmosphereLUT.getTextureNode('transmittance'),
      atmosphereLUT.getTextureNode('scattering'),
      atmosphereLUT.getTextureNode('singleMieScattering'),
      atmosphereLUT.getTextureNode('higherOrderScattering'),
      camera,
      viewRay,
      shadowLength,
      sunDirection,
      options
    ).toVar()

    const luminance = radianceTransfer
      .get('radiance')
      .mul(parameters.skyRadianceToLuminance.mul(parameters.luminanceScale))
    return luminanceTransferStruct(
      luminance,
      radianceTransfer.get('transmittance')
    )
  }
)

export const getSkyLuminanceToPoint = /*#__PURE__*/ Fnv(
  (
    atmosphereLUT: AtmosphereLUTNode,
    camera: NodeObject<Position>,
    point: NodeObject<Position>,
    shadowLength: NodeObject<Length>,
    sunDirection: NodeObject<Direction>
  ): LuminanceTransferStruct => {
    const parameters = atmosphereLUT.parameters.getNodes()
    const radianceTransfer = getSkyRadianceToPoint(
      parameters,
      atmosphereLUT.getTextureNode('transmittance'),
      atmosphereLUT.getTextureNode('scattering'),
      atmosphereLUT.getTextureNode('singleMieScattering'),
      atmosphereLUT.getTextureNode('higherOrderScattering'),
      camera,
      point,
      shadowLength,
      sunDirection
    ).toVar()

    const luminance = radianceTransfer
      .get('radiance')
      .mul(parameters.skyRadianceToLuminance.mul(parameters.luminanceScale))
    return luminanceTransferStruct(
      luminance,
      radianceTransfer.get('transmittance')
    )
  }
)

const sunAndSkyIlluminanceStruct = /*#__PURE__*/ struct({
  sunIlluminance: Illuminance3,
  skyIlluminance: Illuminance3
})
type SunAndSkyIlluminanceStruct = ReturnType<typeof sunAndSkyIlluminanceStruct>

export const getSunAndSkyIlluminance = /*#__PURE__*/ Fnv(
  (
    atmosphereLUT: AtmosphereLUTNode,
    point: NodeObject<Position>,
    normal: NodeObject<Direction>,
    sunDirection: NodeObject<Direction>
  ): SunAndSkyIlluminanceStruct => {
    const parameters = atmosphereLUT.parameters.getNodes()
    const sunSkyIrradiance = getSunAndSkyIrradiance(
      parameters,
      atmosphereLUT.getTextureNode('transmittance'),
      atmosphereLUT.getTextureNode('irradiance'),
      point,
      normal,
      sunDirection
    ).toVar()

    const sunIlluminance = sunSkyIrradiance
      .get('sunIrradiance')
      .mul(parameters.sunRadianceToLuminance.mul(parameters.luminanceScale))
    const skyIlluminance = sunSkyIrradiance
      .get('skyIrradiance')
      .mul(parameters.skyRadianceToLuminance.mul(parameters.luminanceScale))
    return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
  }
)

export const getSkyIlluminance = /*#__PURE__*/ Fnv(
  (
    atmosphereLUT: AtmosphereLUTNode,
    point: NodeObject<Position>,
    normal: NodeObject<Direction>,
    sunDirection: NodeObject<Direction>
  ): Node<Illuminance3> => {
    const parameters = atmosphereLUT.parameters.getNodes()
    const sunSkyIrradiance = getSkyIrradiance(
      parameters,
      atmosphereLUT.getTextureNode('irradiance'),
      point,
      normal,
      sunDirection
    )
    return sunSkyIrradiance.mul(
      parameters.skyRadianceToLuminance.mul(parameters.luminanceScale)
    )
  }
)

// Added for the cloud particles.
export const getSunAndSkyScalarIlluminance = /*#__PURE__*/ Fnv(
  (
    atmosphereLUT: AtmosphereLUTNode,
    point: NodeObject<Position>,
    sunDirection: NodeObject<Direction>
  ): SunAndSkyIlluminanceStruct => {
    const parameters = atmosphereLUT.parameters.getNodes()
    const sunSkyIrradiance = getSunAndSkyScalarIrradiance(
      parameters,
      atmosphereLUT.getTextureNode('transmittance'),
      atmosphereLUT.getTextureNode('irradiance'),
      point,
      sunDirection
    ).toVar()

    const sunIlluminance = sunSkyIrradiance
      .get('sunIrradiance')
      .mul(parameters.sunRadianceToLuminance.mul(parameters.luminanceScale))
    const skyIlluminance = sunSkyIrradiance
      .get('skyIrradiance')
      .mul(parameters.skyRadianceToLuminance.mul(parameters.luminanceScale))
    return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
  }
)
