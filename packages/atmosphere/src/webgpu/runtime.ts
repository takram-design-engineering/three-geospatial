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
  getScattering,
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
  type Length2,
  type Position
} from './dimensional'
import { computeIndirectRadianceToPoint } from './multiscattering'

interface ScatteringParams {
  radius: Node<Length>
  cosView: Node<Dimensionless>
  cosLight: Node<Dimensionless>
}

const getScatteringParams = (
  parameters: Node,
  radius: Node<Length>,
  cosView: Node<Dimensionless>,
  cosLight: Node<Dimensionless>,
  cosViewLight: Node<Dimensionless>,
  distanceToPoint: Node<Length>
): ScatteringParams => {
  const radiusP = clampRadius(
    parameters,
    sqrt(
      distanceToPoint
        .pow2()
        .add(mul(2, radius, cosView, distanceToPoint))
        .add(radius.pow2())
    )
  ).toConst()
  const cosViewP = radius
    .mul(cosView)
    .add(distanceToPoint)
    .div(radiusP)
    .toConst()
  const cosLightP = radius
    .mul(cosLight)
    .add(distanceToPoint.mul(cosViewLight))
    .div(radiusP)
    .toConst()

  return {
    radius: radiusP,
    cosView: cosViewP,
    cosLight: cosLightP
  }
}

const getIndirectRadiance = /*#__PURE__*/ FnVar(
  (
    context: AtmosphereContext,
    camera: Node<Position>,
    rayDirection: Node<Direction>,
    shadowLength: Node<Length2>,
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
      ).toVar()

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

      if (!context.showGround) {
        intersectsGround.assign(bool(false))
      }

      // Note that the `scattering` contains only the single Rayleigh scattering
      // term when higherOrderScatteringTexture is enabled, whereas it also
      // includes multiple scattering over the Rayleigh phase when
      // higherOrderScatteringTexture is disabled.
      const scattering = vec3(0).toVar()
      const singleMieScattering = vec3(0).toVar()

      const getScatteringAndTransmittance = (
        rayLength: Node<Length>
      ): {
        S: Node<IrradianceSpectrum>
        M: Node<IrradianceSpectrum>
        T: Node<DimensionlessSpectrum>
      } => {
        const params = getScatteringParams(
          parametersNode,
          radius,
          cosView,
          cosLight,
          cosViewLight,
          rayLength
        )
        const combinedScattering = getCombinedScattering(
          parametersNode,
          scatteringNode,
          singleMieScatteringNode,
          params.radius,
          params.cosView,
          params.cosLight,
          cosViewLight,
          intersectsGround
        ).toConst()
        const transmittance = getTransmittance(
          transmittanceNode,
          radius,
          cosView,
          rayLength,
          intersectsGround
        )
        return {
          S: combinedScattering.get('scattering'),
          M: combinedScattering.get('singleMieScattering'),
          T: transmittance
        }
      }

      const shadowLimit = shadowLength.y.add(shadowLength.x).toConst()

      // In case where the camera is inside shadows, we omit the scattering
      // between the camera and the point at shadowLength.x.
      //
      // camera |////////////////|-----------> top atmosphere
      //        | shadowLength.x |
      //                         P
      //
      // S = T(0,p)S(P)
      const scatteringBranch2 = (): void => {
        const p = getScatteringAndTransmittance(shadowLength.x)
        scattering.assign(p.T.mul(p.S))
        singleMieScattering.assign(p.T.mul(p.M))
      }

      // In case where the camera is outside shadows, we have to lookup
      // additional scattering to subtract the shadow segment, otherwise the it
      // becomes darker.
      //
      //              shadowLength.y
      // camera |-----------|////////////////|-----------> top atmosphere
      //                    | shadowLength.x |
      //                    A                B
      //
      // S = S(camera) - T(0,a)S(A) + T(0,b)S(B)
      const scatteringBranch3 = (): void => {
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

        const S = combinedScattering.get('scattering')
        const M = combinedScattering.get('singleMieScattering')
        const a = getScatteringAndTransmittance(shadowLength.y)
        const b = getScatteringAndTransmittance(shadowLimit)
        scattering.assign(S.sub(a.T.mul(a.S).sub(b.T.mul(b.S)).max(0)))
        singleMieScattering.assign(M.sub(a.T.mul(a.M).sub(b.T.mul(b.M)).max(0)))
      }

      const scatteringConditional = If(shadowLength.x.equal(0), () => {
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

        scattering.assign(combinedScattering.get('scattering'))
        singleMieScattering.assign(
          combinedScattering.get('singleMieScattering')
        )
      })

      if (context.accurateShadowScattering) {
        scatteringConditional
          .ElseIf(shadowLength.y.equal(0), scatteringBranch2)
          .Else(scatteringBranch3)
      } else {
        scatteringConditional.Else(scatteringBranch2)
      }

      // In case higherOrderScatteringTexture is enabled, the scattering texture
      // includes the single Rayleigh scattering term, so we just add the
      // higher-order scattering radiance regardless of occlusion.
      let multipleScattering: Node<'vec3'> = vec3(0)
      if (context.parameters.higherOrderScatteringTexture) {
        const higherOrderScatteringTexture = lutNode.getTextureNode(
          'higherOrderScattering'
        )
        multipleScattering = getScattering(
          higherOrderScatteringTexture,
          radius,
          cosView,
          cosLight,
          cosViewLight,
          intersectsGround
        )
      }

      const rayleighPhase = rayleighPhaseFunction(cosViewLight)
      const miePhase = miePhaseFunction(miePhaseFunctionG, cosViewLight)
      radiance.assign(
        scattering
          .mul(rayleighPhase)
          .add(singleMieScattering.mul(miePhase))
          .add(multipleScattering)
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
    shadowLength: Node<Length2>
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

    // Note that the `scattering` contains only the single Rayleigh scattering
    // term when higherOrderScatteringTexture is enabled, whereas it also
    // includes multiple scattering over the Rayleigh phase when
    // higherOrderScatteringTexture is disabled.
    const scattering = vec3(0).toVar()
    const singleMieScattering = vec3(0).toVar()

    const getScatteringAndTransmittance = (
      rayLength: Node<Length>,
      transmittance?: Node<DimensionlessSpectrum>
    ): {
      S: Node<IrradianceSpectrum>
      M: Node<IrradianceSpectrum>
      T: Node<DimensionlessSpectrum>
    } => {
      const params = getScatteringParams(
        parametersNode,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        rayLength
      )
      const combinedScattering = getCombinedScattering(
        parametersNode,
        scatteringNode,
        singleMieScatteringNode,
        params.radius,
        params.cosView,
        params.cosLight,
        cosViewLight,
        intersectsGround
      ).toConst()
      return {
        S: combinedScattering.get('scattering'),
        M: combinedScattering.get('singleMieScattering'),
        T:
          transmittance ??
          getTransmittance(
            transmittanceNode,
            radius,
            cosView,
            rayLength,
            intersectsGround
          )
      }
    }

    const shadowLimit = shadowLength.y.add(shadowLength.x).toConst()
    const shadowFlags = vec3(shadowLength.xy, distanceToPoint)
      .greaterThan(vec3(0, 0, shadowLimit))
      .toConst()
    const hasShadow = shadowFlags.x

    // Compute the scattering parameters for the second texture lookup.
    // If shadowLength.x is not 0 (case of light shafts), we want to ignore
    // the scattering along the last shadowLength.x of the view ray, which
    // we do by subtracting shadowLength.x from distanceToPoint.
    //
    //        |      distanceToPoint      |
    // camera |---------------------------| surface //////> extremity
    //                                    |
    //                                    P
    //             shadowLength.y
    // camera |----------|////////////////| surface //////> extremity
    //                   | shadowLength.x |
    //                   P
    //
    // S = S(camera) - T(0,p)S(P)
    const scatteringBranch1 = (): void => {
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

      const distance = distanceToPoint.sub(shadowLength.x).max(0).toConst()
      const p = getScatteringAndTransmittance(
        distance,
        hasShadow.select(
          getTransmittance(
            transmittanceNode,
            radius,
            cosView,
            distance,
            intersectsGround
          ),
          transmittance
        )
      )

      const S = combinedScattering.get('scattering')
      const M = combinedScattering.get('singleMieScattering')
      scattering.assign(S.sub(p.T.mul(p.S)))
      singleMieScattering.assign(M.sub(p.T.mul(p.M)))
    }

    //        |      distanceToPoint      |
    // camera |////////////////|----------| surface //////> extremity
    //        | shadowLength.x |          P
    //                         Q
    //
    // S = T(0,q)S(Q) - T(0,p)S(P)
    const scatteringBranch2 = (): void => {
      const q = getScatteringAndTransmittance(shadowLimit)
      const p = getScatteringAndTransmittance(distanceToPoint, transmittance)
      scattering.assign(q.T.mul(q.S).sub(transmittance.mul(p.S)))
      singleMieScattering.assign(q.T.mul(q.M).sub(transmittance.mul(p.M)))
    }

    //        |         distanceToPoint        |
    //        | shadowLength.y                 |
    // camera |-------|////////////////|-------| surface //////> extremity
    //                | shadowLength.x |       P
    //                A                B
    //
    // S = S(camera) - T(0,p)S(P) - T(0,a)S(A) + T(0,b)S(B)
    const scatteringBranch3 = (): void => {
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

      const S = combinedScattering.get('scattering')
      const M = combinedScattering.get('singleMieScattering')
      const a = getScatteringAndTransmittance(shadowLength.y)
      const b = getScatteringAndTransmittance(shadowLimit)
      const p = getScatteringAndTransmittance(distanceToPoint)
      scattering.assign(
        S.sub(transmittance.mul(p.S), a.T.mul(a.S).sub(b.T.mul(b.S)).max(0))
      )
      singleMieScattering.assign(
        M.sub(transmittance.mul(p.M), a.T.mul(a.M).sub(b.T.mul(b.M)).max(0))
      )
    }

    if (context.accurateShadowScattering) {
      If(
        // shadowLength.y === 0 && distanceToPoint > shadowLimit
        hasShadow.and(shadowFlags.y.not()).and(shadowFlags.z),
        scatteringBranch2
      )
        .ElseIf(
          // distanceToPoint > shadowLength.y + shadowLength.x
          hasShadow.and(shadowFlags.z),
          scatteringBranch3
        )
        .Else(scatteringBranch1)
    } else {
      scatteringBranch1()
    }

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

    // In case higherOrderScatteringTexture is enabled, the scattering texture
    // includes the single Rayleigh scattering term, so we just add the
    // higher-order scattering radiance regardless of occlusion.
    let multipleScattering: Node<'vec3'> = vec3(0)
    if (context.parameters.higherOrderScatteringTexture) {
      const higherOrderScatteringTexture = lutNode.getTextureNode(
        'higherOrderScattering'
      )
      const higherOrderScattering = getScattering(
        higherOrderScatteringTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        intersectsGround
      ).toConst()

      const paramsP = getScatteringParams(
        parametersNode,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        distanceToPoint
      )
      const higherOrderScatteringP = getScattering(
        higherOrderScatteringTexture,
        paramsP.radius,
        paramsP.cosView,
        paramsP.cosLight,
        cosViewLight,
        intersectsGround
      ).toConst()

      multipleScattering = higherOrderScattering.sub(
        transmittance.mul(higherOrderScatteringP)
      )
    }

    const rayleighPhase = rayleighPhaseFunction(cosViewLight)
    const miePhase = miePhaseFunction(miePhaseFunctionG, cosViewLight)
    scattering.assign(
      scattering
        .mul(rayleighPhase)
        .add(singleMieScattering.mul(miePhase))
        .add(multipleScattering)
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
    shadowLength: Node<Length2>
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
    shadowLength: Node<Length2>,
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

      // Extrapolate the inscattered light sampled above to the actual distance
      // between the camera and point, assuming both averages are the same (not
      // really).
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
    shadowLength: Node<Length2>,
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
    shadowLength: Node<Length2>,
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
