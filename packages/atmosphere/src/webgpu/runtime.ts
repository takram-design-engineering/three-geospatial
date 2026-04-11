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
  floor,
  If,
  max,
  mul,
  not,
  PI,
  PI2,
  smoothstep,
  sqrt,
  struct,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout, FnVar, type Node } from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import {
  atmosphereParametersStruct,
  getAtmosphereContextBase,
  makeDestructible
} from './AtmosphereContextBase'
import {
  clampRadius,
  computeSingleScatteringToPoint,
  getIrradiance,
  getScattering,
  getScatteringTextureCoord,
  getTransmittance,
  getTransmittanceToSun,
  getTransmittanceToTopAtmosphereBoundary,
  miePhaseFunction,
  rayIntersectsGround,
  rayleighPhaseFunction,
  sqrtSafe
} from './common'
import {
  Dimensionless,
  DimensionlessSpectrum,
  Direction,
  Illuminance3,
  IrradianceSpectrum,
  IrradianceTexture,
  Length,
  Luminance3,
  Position,
  RadianceSpectrum,
  ReducedScatteringTexture,
  TransmittanceTexture
} from './dimensional'

const getExtrapolatedSingleMieScattering = /*#__PURE__*/ FnLayout({
  name: 'getExtrapolatedSingleMieScattering',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'scattering', type: 'vec4' }
  ]
})(([parameters, scattering]) => {
  const { rayleighScattering, mieScattering } = makeDestructible(parameters)

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

const combinedScatteringStruct = /*#__PURE__*/ struct(
  {
    scattering: IrradianceSpectrum,
    singleMieScattering: IrradianceSpectrum
  },
  'CombinedScattering'
)

const getCombinedScattering = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getCombinedScattering',
  type: combinedScatteringStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosLight', type: Dimensionless },
    { name: 'cosViewLight', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [
    parameters,
    scatteringTexture,
    singleMieScatteringTexture,
    radius,
    cosView,
    cosLight,
    cosViewLight,
    viewRayIntersectsGround
  ],
  builder
) => {
  const context = getAtmosphereContextBase(builder)
  const { scatteringTextureCosViewLightSize } = makeDestructible(parameters)

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
      scatteringTexture.sample(coord0).mul(lerp.oneMinus()),
      scatteringTexture.sample(coord1).mul(lerp)
    ).toConst()
    scattering.assign(combinedScattering.rgb)
    singleMieScattering.assign(
      getExtrapolatedSingleMieScattering(
        context.parametersNode,
        combinedScattering
      )
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
})

const radianceTransferStruct = /*#__PURE__*/ struct(
  {
    radiance: RadianceSpectrum,
    transmittance: DimensionlessSpectrum
  },
  'RadianceTransfer'
)

const getIndirectRadiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getIndirectRadiance',
  type: radianceTransferStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'viewRay', type: Direction },
    { name: 'shadowLength', type: Length },
    { name: 'lightDirection', type: Direction }
  ]
})((
  [
    parameters,
    transmittanceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
    camera,
    viewRay,
    shadowLength,
    lightDirection
  ],
  builder
) => {
  const context = getAtmosphereContext(builder)
  const { topRadius, bottomRadius, miePhaseFunctionG } =
    makeDestructible(parameters)

  // Clamp the viewer at the bottom atmosphere boundary for rendering points
  // below it.
  const radius = camera.length().toVar()
  const movedCamera = camera.toVar()
  if (context.constrainCamera) {
    If(radius.lessThan(bottomRadius), () => {
      radius.assign(bottomRadius)
      movedCamera.assign(camera.normalize().mul(radius))
    })
  }

  // Compute the distance to the top atmosphere boundary along the view ray,
  // assuming the viewer is in space.
  const radiusCosView = movedCamera.dot(viewRay).toVar()
  const distanceToTop = radiusCosView
    .negate()
    .sub(
      sqrtSafe(radiusCosView.pow2().sub(radius.pow2()).add(topRadius.pow2()))
    )
    .toConst()

  // If the viewer is in space and the view ray intersects the atmosphere,
  // move the viewer to the top atmosphere boundary along the view ray.
  If(distanceToTop.greaterThan(0), () => {
    movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
    radius.assign(topRadius)
    radiusCosView.addAssign(distanceToTop)
  })

  const radiance = vec3(0).toVar()
  const transmittance = vec3(1).toVar()

  // If the view ray does not intersect the atmosphere, simply return 0.
  If(radius.lessThanEqual(topRadius), () => {
    // Compute the scattering parameters needed for the texture lookups.
    const cosView = radiusCosView.div(radius).toConst()
    const cosLight = movedCamera.dot(lightDirection).div(radius).toConst()
    const cosViewLight = viewRay.dot(lightDirection).toConst()

    const viewRayIntersectsGround = rayIntersectsGround(
      context.parametersNode,
      radius,
      cosView
    ).toConst()
    const scatteringRayIntersectsGround = context.showGround
      ? viewRayIntersectsGround
      : bool(false)

    transmittance.assign(
      viewRayIntersectsGround.select(
        0,
        getTransmittanceToTopAtmosphereBoundary(
          transmittanceTexture,
          radius,
          cosView
        )
      )
    )

    const scattering = vec3(0).toVar()
    const singleMieScattering = vec3(0).toVar()

    If(shadowLength.equal(0), () => {
      const combinedScattering = getCombinedScattering(
        parameters,
        scatteringTexture,
        singleMieScatteringTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        scatteringRayIntersectsGround
      ).toConst()
      scattering.assign(combinedScattering.get('scattering'))
      singleMieScattering.assign(combinedScattering.get('singleMieScattering'))
    }).Else(() => {
      // Case of light shafts, we omit the scattering between the camera and
      // the point at shadowLength.
      const radiusP = clampRadius(
        context.parametersNode,
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
        parameters,
        scatteringTexture,
        singleMieScatteringTexture,
        radiusP,
        cosViewP,
        cosLightP,
        cosViewLight,
        scatteringRayIntersectsGround
      ).toConst()
      scattering.assign(combinedScattering.get('scattering'))
      singleMieScattering.assign(combinedScattering.get('singleMieScattering'))

      const shadowTransmittance = getTransmittance(
        transmittanceTexture,
        radius,
        cosView,
        shadowLength,
        scatteringRayIntersectsGround
      ).toConst()

      // Occlude only single Rayleigh scattering by the shadow.
      if (context.parameters.higherOrderScatteringTexture) {
        const higherOrderScattering = getScattering(
          higherOrderScatteringTexture,
          radiusP,
          cosViewP,
          cosLightP,
          cosViewLight,
          scatteringRayIntersectsGround
        ).toConst()
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
        .mul(rayleighPhaseFunction(cosViewLight))
        .add(
          singleMieScattering.mul(
            miePhaseFunction(miePhaseFunctionG, cosViewLight)
          )
        )
    )
  })

  return radianceTransferStruct(radiance, transmittance)
})

const getIndirectRadianceToPointImpl = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getIndirectRadianceToPointImpl',
  type: radianceTransferStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'point', type: Position },
    { name: 'shadowLength', type: Length },
    { name: 'lightDirection', type: Direction }
  ]
})((
  [
    parameters,
    transmittanceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
    camera,
    point,
    shadowLength,
    lightDirection
  ],
  builder
) => {
  const context = getAtmosphereContext(builder)
  const { topRadius, bottomRadius, miePhaseFunctionG } =
    makeDestructible(parameters)

  // Compute the distance to the top atmosphere boundary along the view ray,
  // assuming the viewer is in space.
  const viewRay = point.sub(camera).normalize().toConst()
  const radius = camera.length().toVar()
  const radiusCosView = camera.dot(viewRay).toVar()
  const distanceToTop = radiusCosView
    .negate()
    .sub(
      sqrtSafe(radiusCosView.pow2().sub(radius.pow2()).add(topRadius.pow2()))
    )
    .toConst()

  // If the viewer is in space and the view ray intersects the atmosphere,
  // move the viewer to the top atmosphere boundary along the view ray.
  const movedCamera = camera.toVar()
  If(distanceToTop.greaterThan(0), () => {
    movedCamera.assign(movedCamera.add(viewRay.mul(distanceToTop)))
    radius.assign(topRadius)
    radiusCosView.addAssign(distanceToTop)
  })

  // Compute the scattering parameters for the first texture lookup.
  const cosView = radiusCosView.div(radius).toVar()
  const cosLight = movedCamera.dot(lightDirection).div(radius).toConst()
  const cosViewLight = viewRay.dot(lightDirection).toConst()
  const distanceToPoint = movedCamera.distance(point).toVar()
  const viewRayIntersectsGround = rayIntersectsGround(
    context.parametersNode,
    radius,
    cosView
  ).toConst()

  // Hack to avoid rendering artifacts near the horizon, due to finite
  // atmosphere texture resolution and finite floating point precision.
  If(not(viewRayIntersectsGround), () => {
    const cosHorizon = sqrtSafe(
      bottomRadius.pow2().div(radius.pow2()).oneMinus()
    )
      .negate()
      .toConst()
    const eps = 0.004
    cosView.assign(max(cosView, cosHorizon.add(eps)))
  })

  const transmittance = getTransmittance(
    transmittanceTexture,
    radius,
    cosView,
    distanceToPoint,
    viewRayIntersectsGround
  ).toConst()

  const combinedScattering = getCombinedScattering(
    parameters,
    scatteringTexture,
    singleMieScatteringTexture,
    radius,
    cosView,
    cosLight,
    cosViewLight,
    viewRayIntersectsGround
  ).toConst()
  const scattering = combinedScattering.get('scattering').toVar()
  const singleMieScattering = combinedScattering
    .get('singleMieScattering')
    .toVar()

  // Compute the scattering parameters for the second texture lookup.
  // If shadowLength is not 0 (case of light shafts), we want to ignore the
  // scattering along the last shadowLength meters of the view ray, which we
  // do by subtracting shadowLength from distanceToPoint.
  distanceToPoint.assign(distanceToPoint.sub(shadowLength).max(0))
  const radiusP = clampRadius(
    context.parametersNode,
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
  const combinedScatteringP = getCombinedScattering(
    parameters,
    scatteringTexture,
    singleMieScatteringTexture,
    radiusP,
    cosViewP,
    cosLightP,
    cosViewLight,
    viewRayIntersectsGround
  ).toConst()
  const scatteringP = combinedScatteringP.get('scattering')
  const singleMieScatteringP = combinedScatteringP.get('singleMieScattering')

  // Combine the lookup to get the scattering between camera and point.
  const shadowTransmittance = transmittance.toVar()
  If(shadowLength.greaterThan(0), () => {
    shadowTransmittance.assign(
      getTransmittance(
        transmittanceTexture,
        radius,
        cosView,
        distanceToPoint,
        viewRayIntersectsGround
      )
    )
  })

  if (context.parameters.higherOrderScatteringTexture) {
    // Occlude only the single Rayleigh scattering by the shadow.
    const higherOrderScattering = getScattering(
      higherOrderScatteringTexture,
      radius,
      cosView,
      cosLight,
      cosViewLight,
      viewRayIntersectsGround
    ).toConst()
    const higherOrderScatteringP = getScattering(
      higherOrderScatteringTexture,
      radiusP,
      cosViewP,
      cosLightP,
      cosViewLight,
      viewRayIntersectsGround
    ).toConst()

    if (context.raymarchSingleScattering) {
      // TODO: Verify the result with shadow length.
      // TODO: For macroscopic views, ray marching at runtime does not improve
      // quality at all. Run this path selectively.
      const computedSingleScattering = computeSingleScatteringToPoint(
        parameters,
        transmittanceTexture,
        radius,
        cosView,
        cosLight,
        cosViewLight,
        viewRayIntersectsGround,
        distanceToPoint.sub(shadowLength),
        8
      ).toConst()
      const singleScattering = computedSingleScattering.get('rayleigh')
      scattering.assign(
        singleScattering.add(
          higherOrderScattering.sub(transmittance.mul(higherOrderScatteringP))
        )
      )
      singleMieScattering.assign(computedSingleScattering.get('mie'))
    } else {
      const singleScattering = scattering.sub(higherOrderScattering).toConst()
      const singleScatteringP = scatteringP.sub(higherOrderScatteringP)
      scattering.assign(
        singleScattering
          .sub(shadowTransmittance.mul(singleScatteringP))
          .add(
            higherOrderScattering.sub(transmittance.mul(higherOrderScatteringP))
          )
      )
    }
  } else {
    scattering.assign(scattering.sub(shadowTransmittance.mul(scatteringP)))
  }

  if (!context.raymarchSingleScattering) {
    singleMieScattering.assign(
      singleMieScattering.sub(shadowTransmittance.mul(singleMieScatteringP))
    )
    if (context.parameters.combinedScatteringTextures) {
      singleMieScattering.assign(
        getExtrapolatedSingleMieScattering(
          context.parametersNode,
          vec4(scattering, singleMieScattering.r)
        )
      )
    }

    // Hack to avoid rendering artifacts when the light is below the horizon.
    singleMieScattering.assign(
      singleMieScattering.mul(smoothstep(0, 0.01, cosLight))
    )
  }

  // Finally combine the multiple Rayleigh scattering and the single Mie
  // scattering, applying their phase functions.
  scattering.assign(
    scattering
      .mul(rayleighPhaseFunction(cosViewLight))
      .add(
        singleMieScattering.mul(
          miePhaseFunction(miePhaseFunctionG, cosViewLight)
        )
      )
  )
  return radianceTransferStruct(scattering, transmittance)
})

// Returns the distance of the point on the ray from the planet origin.
const distanceToClosestPointOnRay = /*#__PURE__*/ FnLayout({
  name: 'distanceToClosestPointOnRay',
  type: Length,
  inputs: [
    { name: 'camera', type: Position },
    { name: 'point', type: Position }
  ]
})(([camera, point]) => {
  const ray = point.sub(camera).toConst()
  const t = camera.dot(ray).negate().div(ray.dot(ray)).saturate()
  return camera.add(t.mul(ray)).length()
})

const raySphereIntersections = /*#__PURE__*/ FnLayout({
  name: 'raySphereIntersections',
  type: 'vec2',
  inputs: [
    { name: 'camera', type: Position },
    { name: 'direction', type: Direction },
    { name: 'radius', type: Length }
  ]
})(([camera, direction, radius]) => {
  const b = direction.dot(camera).mul(2).toConst()
  const c = camera.dot(camera).sub(radius.pow2())
  const discriminant = b.pow2().sub(c.mul(4))
  const Q = sqrt(discriminant).toConst()
  return vec2(b.negate().sub(Q), b.negate().add(Q)).mul(0.5)
})

const raySegmentStruct = /*#__PURE__*/ struct(
  {
    camera: Position,
    point: Position,
    degenerate: 'bool'
  },
  'RaySegment'
)

// Clip the view ray at the bottom atmosphere boundary.
const clipRayAtBottomAtmosphere = /*#__PURE__*/ FnLayout({
  name: 'clipRayAtBottomAtmosphere',
  type: raySegmentStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'camera', type: Position },
    { name: 'point', type: Position }
  ]
})(([parameters, camera, point]) => {
  const { bottomRadius } = makeDestructible(parameters)

  const cameraBelow = camera.length().lessThan(bottomRadius).toConst()
  const pointBelow = point.length().lessThan(bottomRadius).toConst()

  const viewRay = point.sub(camera).normalize().toConst()
  // Intersection can be NaN without max(0) on "t".
  const t = raySphereIntersections(camera, viewRay, bottomRadius).max(0)
  const intersection = camera.add(viewRay.mul(cameraBelow.select(t.y, t.x)))

  // The ray segment degenerates when the both camera and point are below the
  // bottom atmosphere boundary.
  const clippedCamera = cameraBelow.select(intersection, camera)
  const clippedPoint = pointBelow.select(intersection, point)
  return raySegmentStruct(
    clippedCamera,
    clippedPoint,
    cameraBelow
      .and(pointBelow)
      .or(clippedCamera.distance(clippedPoint).lessThan(1e-7))
  )
})

const getIndirectRadianceToPoint = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getIndirectRadianceToPoint',
  type: radianceTransferStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'point', type: Position },
    { name: 'shadowLength', type: Length },
    { name: 'lightDirection', type: Direction }
  ]
})(([
  parameters,
  transmittanceTexture,
  scatteringTexture,
  singleMieScatteringTexture,
  higherOrderScatteringTexture,
  camera,
  point,
  shadowLength,
  lightDirection
]) => {
  const { topRadius, bottomRadius } = makeDestructible(parameters)

  const radiance = vec3(0).toVar()
  const transmittance = vec3(1).toVar()

  // Avoid artifacts when the ray does not intersect the top atmosphere
  // boundary.
  const distanceToRay = distanceToClosestPointOnRay(camera, point)
  If(distanceToRay.lessThan(topRadius), () => {
    // Move the camera and point slightly above the atmosphere bottom, below
    // which the scattering is undefined.
    const safeBottomRadius = bottomRadius
      .add(topRadius.sub(bottomRadius).mul(0.01)) // About 600 meters
      .toConst()
    const sampleCamera = camera
      .mul(safeBottomRadius.div(camera.length()).max(1))
      .toConst()
    const samplePoint = point
      .mul(safeBottomRadius.div(point.length()).max(1))
      .toConst()

    const result = getIndirectRadianceToPointImpl(
      parameters,
      transmittanceTexture,
      scatteringTexture,
      singleMieScatteringTexture,
      higherOrderScatteringTexture,
      sampleCamera,
      samplePoint,
      shadowLength,
      lightDirection
    ).toConst()

    // Extrapolate the inscatter sampled above to the actual distance between
    // the camera and point, assuming the average is the same (not really).
    const distanceToPoint = camera.distance(point)
    const sampledDistanceToPoint = sampleCamera.distance(samplePoint)
    radiance.assign(
      result.get('radiance').mul(distanceToPoint.div(sampledDistanceToPoint))
    )
    transmittance.assign(result.get('transmittance')) // TODO
  })

  return radianceTransferStruct(radiance, transmittance)
})

const splitIrradianceStruct = /*#__PURE__*/ struct(
  {
    direct: IrradianceSpectrum,
    indirect: IrradianceSpectrum
  },
  'SplitIrradiance'
)

const getSplitIrradiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getSplitIrradiance',
  type: splitIrradianceStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'lightDirection', type: Direction }
  ]
})(([
  parameters,
  transmittanceTexture,
  irradianceTexture,
  point,
  normal,
  lightDirection
]) => {
  const { solarIrradiance } = makeDestructible(parameters)

  const radius = point.length().toConst()
  const cosLight = point.dot(lightDirection).div(radius).toConst()

  const directIrradiance = solarIrradiance.mul(
    getTransmittanceToSun(transmittanceTexture, radius, cosLight),
    normal.dot(lightDirection).max(0)
  )

  // Approximated if the surface is not horizontal.
  const indirectIrradiance = getIrradiance(
    irradianceTexture,
    radius,
    cosLight
  ).mul(normal.dot(point).div(radius).add(1).mul(0.5))

  return splitIrradianceStruct(directIrradiance, indirectIrradiance)
})

const getIndirectIrradiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getIndirectIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'lightDirection', type: Direction }
  ]
})(([irradianceTexture, point, normal, lightDirection]) => {
  const radius = point.length().toConst()
  const cosLight = point.dot(lightDirection).div(radius).toConst()

  // Approximated if the surface is not horizontal.
  return getIrradiance(irradianceTexture, radius, cosLight).mul(
    normal.dot(point).div(radius).add(1).mul(0.5)
  )
})

const getSplitScalarIrradiance = /*#__PURE__*/ FnLayout({
  // TODO: Fn layout doesn't support texture type
  typeOnly: true,
  name: 'getSplitScalarIrradiance',
  type: splitIrradianceStruct,
  inputs: [
    { name: 'parameters', type: atmosphereParametersStruct },
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'lightDirection', type: Direction }
  ]
})(([
  parameters,
  transmittanceTexture,
  irradianceTexture,
  point,
  lightDirection
]) => {
  const { solarIrradiance } = makeDestructible(parameters)

  const radius = point.length().toConst()
  const cosLight = point.dot(lightDirection).div(radius).toConst()

  // Omit the cosine term.
  const directIrradiance = solarIrradiance.mul(
    getTransmittanceToSun(transmittanceTexture, radius, cosLight)
  )

  // Integral over sphere yields 2π.
  const indirectIrradiance = getIrradiance(
    irradianceTexture,
    radius,
    cosLight
  ).mul(PI2)

  return splitIrradianceStruct(directIrradiance, indirectIrradiance)
})

export const getSolarLuminance = /*#__PURE__*/ FnVar(
  () =>
    (builder): Node<Luminance3> => {
      const context = getAtmosphereContextBase(builder)
      const {
        solarIrradiance,
        sunAngularRadius,
        sunRadianceToLuminance,
        luminanceScale
      } = context.parametersNode

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
    viewRay: Node<Direction>,
    shadowLength: Node<Length>,
    lightDirection: Node<Direction>
  ) =>
    (builder): ReturnType<typeof luminanceTransferStruct> => {
      const context = getAtmosphereContext(builder)
      const { lutNode } = context
      const { skyRadianceToLuminance, luminanceScale } = context.parametersNode

      const radianceTransfer = getIndirectRadiance(
        context.parametersNode,
        lutNode.getTextureNode('transmittance'),
        lutNode.getTextureNode('scattering'),
        lutNode.getTextureNode('singleMieScattering'),
        lutNode.getTextureNode('higherOrderScattering'),
        camera,
        viewRay,
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
      const { lutNode } = context
      const { skyRadianceToLuminance, luminanceScale } = context.parametersNode

      const radianceTransfer = getIndirectRadianceToPoint(
        context.parametersNode,
        lutNode.getTextureNode('transmittance'),
        lutNode.getTextureNode('scattering'),
        lutNode.getTextureNode('singleMieScattering'),
        lutNode.getTextureNode('higherOrderScattering'),
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
      const { lutNode } = context
      const { sunRadianceToLuminance, skyRadianceToLuminance, luminanceScale } =
        context.parametersNode

      const splitIrradiance = getSplitIrradiance(
        context.parametersNode,
        lutNode.getTextureNode('transmittance'),
        lutNode.getTextureNode('irradiance'),
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
      const { lutNode } = context
      const { skyRadianceToLuminance, luminanceScale } = context.parametersNode

      const indirectIrradiance = getIndirectIrradiance(
        lutNode.getTextureNode('irradiance'),
        point,
        normal,
        lightDirection
      )
      return indirectIrradiance.mul(skyRadianceToLuminance.mul(luminanceScale))
    }
)

// Added for the cloud particles.
export const getSplitScalarIlluminance = /*#__PURE__*/ FnVar(
  (point: Node<Position>, lightDirection: Node<Direction>) =>
    (builder): ReturnType<typeof splitIlluminanceStruct> => {
      const context = getAtmosphereContext(builder)
      const { lutNode } = context
      const { sunRadianceToLuminance, skyRadianceToLuminance, luminanceScale } =
        context.parametersNode

      const splitIrradiance = getSplitScalarIrradiance(
        context.parametersNode,
        lutNode.getTextureNode('transmittance'),
        lutNode.getTextureNode('irradiance'),
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
