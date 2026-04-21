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
  If,
  mix,
  mul,
  PI,
  PI2,
  smoothstep,
  sqrt,
  struct,
  vec3,
  vec4
} from 'three/tsl'

import { FnVar, type Node } from '@takram/three-geospatial/webgpu'

import {
  getAtmosphereContext,
  type AtmosphereContext
} from './AtmosphereContext'
import { getAtmosphereContextBase } from './AtmosphereContextBase'
import {
  clampRadius,
  getCombinedScattering,
  getExtrapolatedSingleMieScattering,
  getIrradiance,
  getTransmittance,
  getTransmittanceToSun,
  getTransmittanceToTopAtmosphereBoundary,
  miePhaseFunction,
  radianceTransferStruct,
  rayIntersectsGround,
  rayleighPhaseFunction,
  sqrtSafe
} from './common'
import {
  DimensionlessSpectrum,
  Illuminance3,
  IrradianceSpectrum,
  Luminance3,
  type Dimensionless,
  type Direction,
  type Length,
  type Position
} from './dimensional'
import { computeIndirectRadianceToPoint } from './multiscattering'

const getIndirectRadiance = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    camera: Node<Position>,
    rayDirection: Node<Direction>,
    shadowLength: Node<Length>,
    lightDirection: Node<Direction>
  ): ReturnType<typeof radianceTransferStruct> => {
    const { lutNode, parametersNode } = context
    const transmittanceNode = lutNode.getTextureNode('transmittance')
    const scatteringNode = lutNode.getTextureNode('scattering')
    const singleMieScatteringNode = lutNode.getTextureNode(
      'singleMieScattering'
    )
    const { topRadius, bottomRadius, miePhaseFunctionG } = parametersNode

    // Clamp the viewer at the bottom atmosphere boundary for rendering points
    // below it.
    const radius = camera.length().toVar()
    camera = camera.toVar()
    if (context.constrainCamera) {
      If(radius.lessThan(bottomRadius), () => {
        radius.assign(bottomRadius)
        camera.assign(camera.normalize().mul(radius))
      })
    }

    // Compute the distance to the top atmosphere boundary along the view ray,
    // assuming the viewer is in space.
    const radiusCosView = camera.dot(rayDirection).toVar()
    const distanceToTop = radiusCosView
      .negate()
      .sub(
        sqrtSafe(radiusCosView.pow2().sub(radius.pow2()).add(topRadius.pow2()))
      )
      .toConst()

    // If the viewer is in space and the view ray intersects the atmosphere,
    // move the viewer to the top atmosphere boundary along the view ray.
    If(distanceToTop.greaterThan(0), () => {
      camera.assign(camera.add(rayDirection.mul(distanceToTop)))
      radius.assign(topRadius)
      radiusCosView.addAssign(distanceToTop)
    })

    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // If the view ray does not intersect the atmosphere, simply return 0.
    If(radius.lessThanEqual(topRadius), () => {
      // Compute the scattering parameters needed for the texture lookups.
      const cosView = radiusCosView.div(radius).toConst()
      const cosLight = camera.dot(lightDirection).div(radius).toConst()
      const cosViewLight = rayDirection.dot(lightDirection).toConst()

      const intersectsGround = rayIntersectsGround(
        parametersNode,
        radius,
        cosView
      ).toConst()
      const intersectsGroundScattering = context.showGround
        ? intersectsGround
        : bool(false)

      transmittance.assign(
        intersectsGround.select(
          0,
          getTransmittanceToTopAtmosphereBoundary(
            transmittanceNode,
            radius,
            cosView
          )
        )
      )

      const scattering = vec3(0).toVar()
      const singleMieScattering = vec3(0).toVar()

      If(shadowLength.equal(0), () => {
        const combinedScattering = getCombinedScattering(
          parametersNode,
          scatteringNode,
          singleMieScatteringNode,
          radius,
          cosView,
          cosLight,
          cosViewLight,
          intersectsGroundScattering
        ).toConst()
        scattering.assign(combinedScattering.get('scattering'))
        singleMieScattering.assign(
          combinedScattering.get('singleMieScattering')
        )
      }).Else(() => {
        // Case of light shafts, we omit the scattering between the camera and
        // the point at shadowLength.
        const radiusP = clampRadius(
          parametersNode,
          sqrt(
            shadowLength
              .pow2()
              .add(mul(2, radius, cosView, shadowLength))
              .add(radius.pow2())
          )
        ).toConst()
        const cosViewP = radius
          .mul(cosView)
          .add(shadowLength)
          .div(radiusP)
          .toConst()
        const cosLightP = radius
          .mul(cosLight)
          .add(shadowLength.mul(cosViewLight))
          .div(radiusP)
          .toConst()

        const combinedScattering = getCombinedScattering(
          parametersNode,
          scatteringNode,
          singleMieScatteringNode,
          radiusP,
          cosViewP,
          cosLightP,
          cosViewLight,
          intersectsGroundScattering
        ).toConst()
        scattering.assign(combinedScattering.get('scattering'))
        singleMieScattering.assign(
          combinedScattering.get('singleMieScattering')
        )

        const shadowTransmittance = getTransmittance(
          transmittanceNode,
          radius,
          cosView,
          shadowLength,
          intersectsGroundScattering
        ).toConst()

        scattering.assign(scattering.mul(shadowTransmittance))
        singleMieScattering.assign(singleMieScattering.mul(shadowTransmittance))
      })

      radiance.assign(
        scattering
          .mul(rayleighPhaseFunction(cosViewLight))
          .add(
            singleMieScattering.mul(
              miePhaseFunction(miePhaseFunctionG, cosViewLight)
            )
          )
      )
    })

    return radianceTransferStruct(radiance, transmittance)
  }
)

const getIndirectRadianceToPointLookup = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    distanceToPoint: Node<Length>,
    shadowLength: Node<Length>
  ): ReturnType<typeof radianceTransferStruct> => {
    const { lutNode, parametersNode } = context
    const transmittanceNode = lutNode.getTextureNode('transmittance')
    const scatteringNode = lutNode.getTextureNode('scattering')
    const singleMieScatteringNode = lutNode.getTextureNode(
      'singleMieScattering'
    )
    const { rayleighScattering, mieScattering, miePhaseFunctionG } =
      parametersNode

    // Compute the scattering parameters for the first texture lookup.
    const intersectsGround = rayIntersectsGround(
      parametersNode,
      radius,
      cosView
    ).toConst()

    const transmittance = getTransmittance(
      transmittanceNode,
      radius,
      cosView,
      distanceToPoint,
      intersectsGround
    ).toConst()

    const combinedScattering = getCombinedScattering(
      parametersNode,
      scatteringNode,
      singleMieScatteringNode,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      intersectsGround
    ).toConst()

    const scattering = combinedScattering.get('scattering').toVar()
    const singleMieScattering = combinedScattering
      .get('singleMieScattering')
      .toVar()

    // Compute the scattering parameters for the second texture lookup.
    // If shadowLength is not 0 (case of light shafts), we want to ignore the
    // scattering along the last shadowLength meters of the view ray, which we
    // do by subtracting shadowLength from distanceToPoint.
    const litDistanceToPoint = distanceToPoint
      .sub(shadowLength)
      .max(0)
      .toConst()
    const radiusP = clampRadius(
      parametersNode,
      sqrt(
        litDistanceToPoint
          .pow2()
          .add(mul(2, radius, cosView, litDistanceToPoint))
          .add(radius.pow2())
      )
    ).toConst()
    const cosViewP = radius
      .mul(cosView)
      .add(litDistanceToPoint)
      .div(radiusP)
      .toConst()
    const cosLightP = radius
      .mul(cosLight)
      .add(litDistanceToPoint.mul(cosViewLight))
      .div(radiusP)
      .toConst()
    const combinedScatteringP = getCombinedScattering(
      parametersNode,
      scatteringNode,
      singleMieScatteringNode,
      radiusP,
      cosViewP,
      cosLightP,
      cosViewLight,
      intersectsGround
    ).toConst()
    const scatteringP = combinedScatteringP.get('scattering')
    const singleMieScatteringP = combinedScatteringP.get('singleMieScattering')

    // Combine the lookup to get the scattering between camera and point.
    const shadowTransmittance = transmittance.toVar()
    If(shadowLength.greaterThan(0), () => {
      shadowTransmittance.assign(
        getTransmittance(
          transmittanceNode,
          radius,
          cosView,
          litDistanceToPoint,
          intersectsGround
        )
      )
    })

    scattering.assign(scattering.sub(shadowTransmittance.mul(scatteringP)))
    singleMieScattering.assign(
      singleMieScattering.sub(shadowTransmittance.mul(singleMieScatteringP))
    )

    if (context.parameters.combinedScatteringTextures) {
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(
          vec4(scattering, singleMieScattering.r),
          rayleighScattering,
          mieScattering
        )
      )
    }

    // Hack to avoid rendering artifacts when the light is below the horizon.
    singleMieScattering.assign(
      singleMieScattering.mul(smoothstep(0, 0.01, cosLight))
    )

    scattering.assign(
      add(
        scattering.mul(rayleighPhaseFunction(cosViewLight)),
        singleMieScattering.mul(
          miePhaseFunction(miePhaseFunctionG, cosViewLight)
        )
      )
    )
    return radianceTransferStruct(scattering, transmittance)
  }
)

const getIndirectRadianceToPointRaymarch = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    radius: Node<Length>,
    cosView: Node<Dimensionless>,
    cosLight: Node<Dimensionless>,
    cosViewLight: Node<Dimensionless>,
    distanceToPoint: Node<Length>,
    shadowLength: Node<Length>
  ): ReturnType<typeof radianceTransferStruct> => {
    const result = computeIndirectRadianceToPoint(
      context,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      distanceToPoint,
      shadowLength
    ).toConst()

    const scattering = result.get('radiance')
    const transmittance = result.get('transmittance')
    return radianceTransferStruct(scattering, transmittance)
  }
)

const getIndirectRadianceToPoint = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    camera: Node<Position>,
    point: Node<Position>,
    shadowLength: Node<Length>,
    lightDirection: Node<Direction>
  ): ReturnType<typeof radianceTransferStruct> => {
    const { parametersNode } = context
    const { topRadius, bottomRadius } = parametersNode

    const radiance = vec3(0).toVar()
    const transmittance = vec3(1).toVar()

    // Avoid artifacts when the ray "segment" does not intersect the top
    // atmosphere boundary.
    const raySegment = point.sub(camera).toConst()
    const raySegmentT = camera
      .dot(raySegment)
      .negate()
      .div(raySegment.dot(raySegment))
      .saturate()
      .toConst()
    const raySegmentRadius = camera
      .add(raySegmentT.mul(raySegment))
      .length()
      .toConst()

    If(raySegmentRadius.lessThan(topRadius), () => {
      const raySegmentLength = raySegment.length().toConst()

      // Move the camera and point slightly above the atmosphere bottom, below
      // which the scattering is undefined.
      if (!context.raymarchScattering) {
        const safeBottomRadius = bottomRadius
          .add(topRadius.sub(bottomRadius).mul(0.01)) // 600 meters for the default parameters
          .toConst()
        const clampedPoint = point
          .mul(safeBottomRadius.div(point.length()).max(1))
          .toConst()

        // Avoid radial artifacts when the camera looks at the origin, while
        // maintaining correct lighting at far distances.
        const rayDirection = raySegment.div(raySegmentLength)
        camera = mix(
          camera.mul(safeBottomRadius.div(camera.length()).max(1)),
          camera.add(clampedPoint.sub(point)),
          camera.normalize().dot(rayDirection).pow2()
        ).toConst()
        point = clampedPoint
      }

      // Compute the distance to the top atmosphere boundary along the view
      // ray, assuming the viewer is in space.
      const rayDirection = point.sub(camera).normalize().toConst()
      const radius = camera.length().toVar()
      const radiusCosView = camera.dot(rayDirection).toVar()
      const distanceToTop = radiusCosView
        .negate()
        .sub(
          sqrtSafe(
            radiusCosView.pow2().sub(radius.pow2()).add(topRadius.pow2())
          )
        )
        .toConst()

      // If the viewer is in space and the view ray intersects the atmosphere,
      // move the viewer to the top atmosphere boundary along the view ray.
      const rayOrigin = camera.toVar()
      If(distanceToTop.greaterThan(0), () => {
        rayOrigin.addAssign(rayDirection.mul(distanceToTop))
        radius.assign(topRadius)
        radiusCosView.addAssign(distanceToTop)
      })

      const cosView = radiusCosView.div(radius)
      const cosLight = rayOrigin.dot(lightDirection).div(radius)
      const cosViewLight = rayDirection.dot(lightDirection)
      const distanceToPoint = rayOrigin.distance(point)

      if (context.raymarchScattering) {
        // WORKAROUND: As somewhat expected, select() doesn't work here.
        // TODO: The threshold can be lower.
        If(radius.lessThan(topRadius), () => {
          const result = getIndirectRadianceToPointRaymarch(
            context,
            radius,
            cosView,
            cosLight,
            cosViewLight,
            distanceToPoint,
            shadowLength
          ).toConst()
          radiance.assign(result.get('radiance'))
          transmittance.assign(result.get('transmittance'))
        }).Else(() => {
          const result = getIndirectRadianceToPointLookup(
            context,
            radius,
            cosView,
            cosLight,
            cosViewLight,
            distanceToPoint,
            shadowLength
          ).toConst()
          radiance.assign(result.get('radiance'))
          transmittance.assign(result.get('transmittance'))
        })
      } else {
        const result = getIndirectRadianceToPointLookup(
          context,
          radius,
          cosView,
          cosLight,
          cosViewLight,
          distanceToPoint,
          shadowLength
        ).toConst()
        radiance.assign(result.get('radiance'))
        transmittance.assign(result.get('transmittance'))
      }

      // Extrapolate the inscatter sampled above to the actual distance between
      // the camera and point, assuming both averages are the same (not really).
      if (!context.raymarchScattering) {
        const extrapolation = raySegmentLength.div(camera.distance(point))
        radiance.assign(radiance.mul(extrapolation))
        transmittance.assign(transmittance.pow(extrapolation))
      }
    })

    return radianceTransferStruct(radiance, transmittance)
  }
)

const splitIrradianceStruct = /*#__PURE__*/ struct(
  {
    direct: IrradianceSpectrum,
    indirect: IrradianceSpectrum
  },
  'SplitIrradiance'
)

const getSplitIrradiance = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    point: Node<Position>,
    normal: Node<Direction>,
    lightDirection: Node<Direction>
  ): ReturnType<typeof splitIrradianceStruct> => {
    const { lutNode, parametersNode } = context
    const transmittanceNode = lutNode.getTextureNode('transmittance')
    const irradianceNode = lutNode.getTextureNode('irradiance')
    const { solarIrradiance } = parametersNode

    const radius = point.length().toConst()
    const cosLight = point.dot(lightDirection).div(radius).toConst()

    const directIrradiance = solarIrradiance.mul(
      getTransmittanceToSun(transmittanceNode, radius, cosLight),
      normal.dot(lightDirection).max(0)
    )

    // Approximated if the surface is not horizontal.
    const indirectIrradiance = getIrradiance(
      irradianceNode,
      radius,
      cosLight
    ).mul(normal.dot(point).div(radius).add(1).mul(0.5))

    return splitIrradianceStruct(directIrradiance, indirectIrradiance)
  }
)

const getIndirectIrradiance = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    point: Node<Position>,
    normal: Node<Direction>,
    lightDirection: Node<Direction>
  ): Node<IrradianceSpectrum> => {
    const { lutNode } = context
    const irradianceNode = lutNode.getTextureNode('irradiance')
    const radius = point.length().toConst()
    const cosLight = point.dot(lightDirection).div(radius).toConst()

    // Approximated if the surface is not horizontal.
    return getIrradiance(irradianceNode, radius, cosLight).mul(
      normal.dot(point).div(radius).add(1).mul(0.5)
    )
  }
)

const getSplitScalarIrradiance = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    point: Node<Position>,
    lightDirection: Node<Direction>
  ): ReturnType<typeof splitIrradianceStruct> => {
    const { lutNode, parametersNode } = context
    const transmittanceNode = lutNode.getTextureNode('transmittance')
    const irradianceNode = lutNode.getTextureNode('irradiance')
    const { solarIrradiance } = parametersNode

    const radius = point.length().toConst()
    const cosLight = point.dot(lightDirection).div(radius).toConst()

    // Omit the cosine term.
    const directIrradiance = solarIrradiance.mul(
      getTransmittanceToSun(transmittanceNode, radius, cosLight)
    )

    // Integral over sphere.
    const indirectIrradiance = getIrradiance(
      irradianceNode,
      radius,
      cosLight
    ).mul(PI2)

    return splitIrradianceStruct(directIrradiance, indirectIrradiance)
  }
)

export const getSolarLuminance = /*#__PURE__*/ FnVar(
  () =>
    (builder): Node<Luminance3> => {
      const context = getAtmosphereContextBase(builder)
      const { parametersNode } = context
      const {
        solarIrradiance,
        sunAngularRadius,
        sunRadianceToLuminance,
        luminanceScale
      } = parametersNode

      return solarIrradiance
        .div(PI.mul(sunAngularRadius.pow2()))
        .mul(sunRadianceToLuminance.mul(luminanceScale))
    }
)

const luminanceTransferStruct = /*#__PURE__*/ struct(
  {
    luminance: Luminance3,
    transmittance: DimensionlessSpectrum
  },
  'LuminanceTransfer'
)

export const getIndirectLuminance = /*#__PURE__*/ FnVar(
  (
    camera: Node<Position>,
    rayDirection: Node<Direction>,
    shadowLength: Node<Length>,
    lightDirection: Node<Direction>
  ) =>
    (builder): ReturnType<typeof luminanceTransferStruct> => {
      const context = getAtmosphereContext(builder)
      const { parametersNode } = context
      const { skyRadianceToLuminance, luminanceScale } = parametersNode

      const radianceTransfer = getIndirectRadiance(
        context,
        camera,
        rayDirection,
        shadowLength,
        lightDirection
      )

      const luminance = radianceTransfer
        .get('radiance')
        .mul(skyRadianceToLuminance.mul(luminanceScale))
      return luminanceTransferStruct(
        luminance,
        radianceTransfer.get('transmittance')
      )
    }
)

export const getIndirectLuminanceToPoint = /*#__PURE__*/ FnVar(
  (
    camera: Node<Position>,
    point: Node<Position>,
    shadowLength: Node<Length>,
    lightDirection: Node<Direction>
  ) =>
    (builder): ReturnType<typeof luminanceTransferStruct> => {
      const context = getAtmosphereContext(builder)
      const { parametersNode } = context
      const { skyRadianceToLuminance, luminanceScale } = parametersNode

      const radianceTransfer = getIndirectRadianceToPoint(
        context,
        camera,
        point,
        shadowLength,
        lightDirection
      ).toConst()

      const luminance = radianceTransfer
        .get('radiance')
        .mul(skyRadianceToLuminance.mul(luminanceScale))
      return luminanceTransferStruct(
        luminance,
        radianceTransfer.get('transmittance')
      )
    }
)

const splitIlluminanceStruct = /*#__PURE__*/ struct(
  {
    direct: Illuminance3,
    indirect: Illuminance3
  },
  'SplitIlluminance'
)

export const getSplitIlluminance = /*#__PURE__*/ FnVar(
  (
    point: Node<Position>,
    normal: Node<Direction>,
    lightDirection: Node<Direction>
  ) =>
    (builder): ReturnType<typeof splitIlluminanceStruct> => {
      const context = getAtmosphereContext(builder)
      const { parametersNode } = context
      const { sunRadianceToLuminance, skyRadianceToLuminance, luminanceScale } =
        parametersNode

      const splitIrradiance = getSplitIrradiance(
        context,
        point,
        normal,
        lightDirection
      ).toConst()

      const directIlluminance = splitIrradiance
        .get('direct')
        .mul(sunRadianceToLuminance.mul(luminanceScale))
      const indirectIlluminance = splitIrradiance
        .get('indirect')
        .mul(skyRadianceToLuminance.mul(luminanceScale))
      return splitIlluminanceStruct(directIlluminance, indirectIlluminance)
    }
)

export const getIndirectIlluminance = /*#__PURE__*/ FnVar(
  (
    point: Node<Position>,
    normal: Node<Direction>,
    lightDirection: Node<Direction>
  ) =>
    (builder): Node<Illuminance3> => {
      const context = getAtmosphereContext(builder)
      const { parametersNode } = context
      const { skyRadianceToLuminance, luminanceScale } = parametersNode

      const indirectIrradiance = getIndirectIrradiance(
        context,
        point,
        normal,
        lightDirection
      )
      return indirectIrradiance.mul(skyRadianceToLuminance.mul(luminanceScale))
    }
)

export const getSplitScalarIlluminance = /*#__PURE__*/ FnVar(
  (point: Node<Position>, lightDirection: Node<Direction>) =>
    (builder): ReturnType<typeof splitIlluminanceStruct> => {
      const context = getAtmosphereContext(builder)
      const { parametersNode } = context
      const { sunRadianceToLuminance, skyRadianceToLuminance, luminanceScale } =
        parametersNode

      const splitIrradiance = getSplitScalarIrradiance(
        context,
        point,
        lightDirection
      ).toConst()

      const directIlluminance = splitIrradiance
        .get('direct')
        .mul(sunRadianceToLuminance.mul(luminanceScale))
      const indirectIlluminance = splitIrradiance
        .get('indirect')
        .mul(skyRadianceToLuminance.mul(luminanceScale))
      return splitIlluminanceStruct(directIlluminance, indirectIlluminance)
    }
)
