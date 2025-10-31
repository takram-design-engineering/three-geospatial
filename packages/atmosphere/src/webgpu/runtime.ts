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
  select,
  smoothstep,
  sqrt,
  struct,
  vec2,
  vec3,
  vec4
} from 'three/tsl'

import { FnLayout } from '@takram/three-geospatial/webgpu'

import { AtmosphereContextBaseNode } from './AtmosphereContextBaseNode'
import { AtmosphereContextNode } from './AtmosphereContextNode'
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

// TODO: Cannot add layouts on any of these functions due to unknown bugs in the
// TSL builder.

const getExtrapolatedSingleMieScattering = /*#__PURE__*/ FnLayout({
  name: 'getExtrapolatedSingleMieScattering',
  type: IrradianceSpectrum,
  inputs: [{ name: 'scattering', type: 'vec4' }]
})(([scattering], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { rayleighScattering, mieScattering } = context

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
  'combinedScattering'
)

const getCombinedScattering = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getCombinedScattering',
  type: combinedScatteringStruct,
  inputs: [
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'radius', type: Length },
    { name: 'cosView', type: Dimensionless },
    { name: 'cosSun', type: Dimensionless },
    { name: 'cosViewSun', type: Dimensionless },
    { name: 'viewRayIntersectsGround', type: 'bool' }
  ]
})((
  [
    scatteringTexture,
    singleMieScatteringTexture,
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
      getExtrapolatedSingleMieScattering(combinedScattering)
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
  'radianceTransfer'
)

const getSkyRadiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSkyRadiance',
  type: radianceTransferStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'viewRay', type: Direction },
    { name: 'shadowLength', type: Length },
    { name: 'sunDirection', type: Direction }
  ]
})((
  [
    transmittanceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
    camera,
    viewRay,
    shadowLength,
    sunDirection
  ],
  builder
) => {
  const context = AtmosphereContextNode.get(builder)
  const { parameters, topRadius, bottomRadius, miePhaseFunctionG } = context

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
    .toVar()

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
    const cosView = radiusCosView.div(radius).toVar()
    const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
    const cosViewSun = viewRay.dot(sunDirection).toVar()

    const viewRayIntersectsGround = rayIntersectsGround(radius, cosView).toVar()
    const scatteringRayIntersectsGround = context.showGround
      ? viewRayIntersectsGround
      : bool(false)

    transmittance.assign(
      select(
        viewRayIntersectsGround,
        vec3(0),
        getTransmittanceToTopAtmosphereBoundary(
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
        scatteringTexture,
        singleMieScatteringTexture,
        radius,
        cosView,
        cosSun,
        cosViewSun,
        scatteringRayIntersectsGround
      ).toVar()
      scattering.assign(combinedScattering.get('scattering'))
      singleMieScattering.assign(combinedScattering.get('singleMieScattering'))
    }).Else(() => {
      // Case of light shafts, we omit the scattering between the camera and
      // the point at shadowLength.
      const radiusP = clampRadius(
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
        scatteringTexture,
        singleMieScatteringTexture,
        radiusP,
        cosViewP,
        cosSunP,
        cosViewSun,
        scatteringRayIntersectsGround
      ).toVar()
      scattering.assign(combinedScattering.get('scattering'))
      singleMieScattering.assign(combinedScattering.get('singleMieScattering'))

      const shadowTransmittance = getTransmittance(
        transmittanceTexture,
        radius,
        cosView,
        shadowLength,
        scatteringRayIntersectsGround
      ).toVar()

      // Occlude only single Rayleigh scattering by the shadow.
      if (parameters.higherOrderScatteringTexture) {
        const higherOrderScattering = getScattering(
          higherOrderScatteringTexture,
          radiusP,
          cosViewP,
          cosSunP,
          cosViewSun,
          scatteringRayIntersectsGround
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
            miePhaseFunction(miePhaseFunctionG, cosViewSun)
          )
        )
    )
  })

  return radianceTransferStruct(radiance, transmittance)
})

const getSkyRadianceToPointImpl = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSkyRadianceToPointImpl',
  type: radianceTransferStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'point', type: Position },
    { name: 'shadowLength', type: Length },
    { name: 'sunDirection', type: Direction }
  ]
})((
  [
    transmittanceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
    camera,
    point,
    shadowLength,
    sunDirection
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { parameters, topRadius, bottomRadius, miePhaseFunctionG } = context

  // Compute the distance to the top atmosphere boundary along the view ray,
  // assuming the viewer is in space.
  const viewRay = point.sub(camera).normalize().toVar()
  const radius = camera.length().toVar()
  const radiusCosView = camera.dot(viewRay).toVar()
  const distanceToTop = radiusCosView
    .negate()
    .sub(
      sqrtSafe(radiusCosView.pow2().sub(radius.pow2()).add(topRadius.pow2()))
    )
    .toVar()

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
  const cosSun = movedCamera.dot(sunDirection).div(radius).toVar()
  const cosViewSun = viewRay.dot(sunDirection).toVar()
  const distanceToPoint = movedCamera.distance(point).toVar()
  const viewRayIntersectsGround = rayIntersectsGround(radius, cosView).toVar()

  // Hack to avoid rendering artifacts near the horizon, due to finite
  // atmosphere texture resolution and finite floating point precision.
  If(not(viewRayIntersectsGround), () => {
    const cosHorizon = sqrtSafe(
      bottomRadius.pow2().div(radius.pow2()).oneMinus()
    )
      .negate()
      .toVar()
    const eps = 0.004
    cosView.assign(max(cosView, cosHorizon.add(eps)))
  })

  const transmittance = getTransmittance(
    transmittanceTexture,
    radius,
    cosView,
    distanceToPoint,
    viewRayIntersectsGround
  ).toVar()

  const combinedScattering = getCombinedScattering(
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
    sqrt(
      distanceToPoint
        .pow2()
        .add(mul(2, radius, cosView, distanceToPoint))
        .add(radius.pow2())
    )
  ).toVar()
  const cosViewP = radius.mul(cosView).add(distanceToPoint).div(radiusP).toVar()
  const cosSunP = radius
    .mul(cosSun)
    .add(distanceToPoint.mul(cosViewSun))
    .div(radiusP)
    .toVar()
  const combinedScatteringP = getCombinedScattering(
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
      higherOrderScatteringTexture,
      radius,
      cosView,
      cosSun,
      cosViewSun,
      viewRayIntersectsGround
    ).toVar()
    const singleScattering = scattering.sub(higherOrderScattering).toVar()
    const higherOrderScatteringP = getScattering(
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
        singleMieScattering.mul(miePhaseFunction(miePhaseFunctionG, cosViewSun))
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
  const ray = point.sub(camera).toVar()
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
  const b = direction.dot(camera).mul(2).toVar()
  const c = camera.dot(camera).sub(radius.pow2())
  const discriminant = b.pow2().sub(c.mul(4))
  const Q = sqrt(discriminant).toVar()
  return vec2(b.negate().sub(Q), b.negate().add(Q)).mul(0.5)
})

const raySegmentStruct = /*#__PURE__*/ struct(
  {
    camera: Position,
    point: Position,
    degenerate: 'bool'
  },
  'raySegment'
)

// Clip the view ray at the bottom atmosphere boundary.
const clipRayAtBottomAtmosphere = /*#__PURE__*/ FnLayout({
  typeOnly: true, // BUG: Fails with the struct return type in WebGL
  name: 'clipRayAtBottomAtmosphere',
  type: raySegmentStruct,
  inputs: [
    { name: 'camera', type: Position },
    { name: 'point', type: Position }
  ]
})(([camera, point], builder) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { bottomRadius } = context

  const cameraBelow = camera.length().lessThan(bottomRadius).toVar()
  const pointBelow = point.length().lessThan(bottomRadius).toVar()

  const viewRay = point.sub(camera).normalize().toVar()
  // Intersection can be NaN without max(0) on "t".
  const t = raySphereIntersections(camera, viewRay, bottomRadius).max(0)
  const intersection = camera.add(viewRay.mul(select(cameraBelow, t.y, t.x)))

  // The ray segment degenerates when the both camera and point are below the
  // bottom atmosphere boundary.
  const clippedCamera = select(cameraBelow, intersection, camera)
  const clippedPoint = select(pointBelow, intersection, point)
  return raySegmentStruct(
    clippedCamera,
    clippedPoint,
    cameraBelow
      .and(pointBelow)
      .or(clippedCamera.distance(clippedPoint).lessThan(1e-7))
  )
})

const getSkyRadianceToPoint = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSkyRadianceToPoint',
  type: radianceTransferStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'scatteringTexture', type: ReducedScatteringTexture },
    { name: 'singleMieScatteringTexture', type: ReducedScatteringTexture },
    { name: 'higherOrderScatteringTexture', type: ReducedScatteringTexture },
    { name: 'camera', type: Position },
    { name: 'point', type: Position },
    { name: 'shadowLength', type: Length },
    { name: 'sunDirection', type: Direction }
  ]
})((
  [
    transmittanceTexture,
    scatteringTexture,
    singleMieScatteringTexture,
    higherOrderScatteringTexture,
    camera,
    point,
    shadowLength,
    sunDirection
  ],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { topRadius } = context

  const radiance = vec3(0).toVar()
  const transmittance = vec3(1).toVar()

  // Avoid artifacts when the ray does not intersect the top atmosphere
  // boundary.
  const distanceToRay = distanceToClosestPointOnRay(camera, point)
  If(distanceToRay.lessThan(topRadius), () => {
    // Clip the ray at the bottom atmosphere boundary for rendering points
    // below it.
    const clippedRaySegment = clipRayAtBottomAtmosphere(camera, point).toVar()
    const clippedCamera = clippedRaySegment.get('camera')
    const clippedPoint = clippedRaySegment.get('point')
    const degenerate = clippedRaySegment.get('degenerate')

    If(not(degenerate), () => {
      const result = getSkyRadianceToPointImpl(
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
})

const sunAndSkyIrradianceStruct = /*#__PURE__*/ struct(
  {
    sunIrradiance: IrradianceSpectrum,
    skyIrradiance: IrradianceSpectrum
  },
  'sunAndSkyIrradiance'
)

const getSunAndSkyIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSunAndSkyIrradiance',
  type: sunAndSkyIrradianceStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'sunDirection', type: Direction }
  ]
})((
  [transmittanceTexture, irradianceTexture, point, normal, sunDirection],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { solarIrradiance } = context

  const radius = point.length().toVar()
  const cosSun = point.dot(sunDirection).div(radius).toVar()

  // Direct irradiance.
  const sunIrradiance = solarIrradiance.mul(
    getTransmittanceToSun(transmittanceTexture, radius, cosSun),
    normal.dot(sunDirection).max(0)
  )

  // Indirect irradiance (approximated if the surface is not horizontal).
  const skyIrradiance = getIrradiance(irradianceTexture, radius, cosSun).mul(
    normal.dot(point).div(radius).add(1).mul(0.5)
  )

  return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
})

const getSkyIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSkyIrradiance',
  type: IrradianceSpectrum,
  inputs: [
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'sunDirection', type: Direction }
  ]
})(([irradianceTexture, point, normal, sunDirection]) => {
  const radius = point.length().toVar()
  const cosSun = point.dot(sunDirection).div(radius).toVar()

  // Indirect irradiance (approximated if the surface is not horizontal).
  return getIrradiance(irradianceTexture, radius, cosSun).mul(
    normal.dot(point).div(radius).add(1).mul(0.5)
  )
})

const getSunAndSkyScalarIrradiance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Fn layout doesn't support texture type
  name: 'getSunAndSkyScalarIrradiance',
  type: sunAndSkyIrradianceStruct,
  inputs: [
    { name: 'transmittanceTexture', type: TransmittanceTexture },
    { name: 'irradianceTexture', type: IrradianceTexture },
    { name: 'point', type: Position },
    { name: 'sunDirection', type: Direction }
  ]
})((
  [transmittanceTexture, irradianceTexture, point, sunDirection],
  builder
) => {
  const context = AtmosphereContextBaseNode.get(builder)
  const { solarIrradiance } = context

  const radius = point.length().toVar()
  const cosSun = point.dot(sunDirection).div(radius).toVar()

  // Indirect irradiance. Integral over sphere yields 2π.
  const skyIrradiance = getIrradiance(irradianceTexture, radius, cosSun).mul(
    PI2
  )

  // Direct irradiance. Omit the cosine term.
  const sunIrradiance = solarIrradiance.mul(
    getTransmittanceToSun(transmittanceTexture, radius, cosSun)
  )

  return sunAndSkyIrradianceStruct(sunIrradiance, skyIrradiance)
})

export const getSolarLuminance = /*#__PURE__*/ FnLayout({
  name: 'getSolarLuminance',
  type: Luminance3
})(
  // @ts-expect-error TODO
  (_, builder) => {
    const context = AtmosphereContextBaseNode.get(builder)
    const {
      solarIrradiance,
      sunAngularRadius,
      sunRadianceToLuminance,
      luminanceScale
    } = context

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
  'luminanceTransfer'
)

export const getSkyLuminance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Cannot resolve sampler uniforms
  name: 'getSkyLuminance',
  type: luminanceTransferStruct,
  inputs: [
    { name: 'camera', type: Position },
    { name: 'viewRay', type: Direction },
    { name: 'shadowLength', type: Length },
    { name: 'sunDirection', type: Direction }
  ]
})(([camera, viewRay, shadowLength, sunDirection], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const { lutNode, skyRadianceToLuminance, luminanceScale } = context

  const radianceTransfer = getSkyRadiance(
    lutNode.getTextureNode('transmittance'),
    lutNode.getTextureNode('scattering'),
    lutNode.getTextureNode('singleMieScattering'),
    lutNode.getTextureNode('higherOrderScattering'),
    camera,
    viewRay,
    shadowLength,
    sunDirection
  )

  const luminance = radianceTransfer
    .get('radiance')
    .mul(skyRadianceToLuminance.mul(luminanceScale))
  return luminanceTransferStruct(
    luminance,
    radianceTransfer.get('transmittance')
  )
})

export const getSkyLuminanceToPoint = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Cannot resolve sampler uniforms
  name: 'getSkyLuminanceToPoint',
  type: luminanceTransferStruct,
  inputs: [
    { name: 'camera', type: Position },
    { name: 'point', type: Position },
    { name: 'shadowLength', type: Length },
    { name: 'sunDirection', type: Direction }
  ]
})(([camera, point, shadowLength, sunDirection], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const { lutNode, skyRadianceToLuminance, luminanceScale } = context

  const radianceTransfer = getSkyRadianceToPoint(
    lutNode.getTextureNode('transmittance'),
    lutNode.getTextureNode('scattering'),
    lutNode.getTextureNode('singleMieScattering'),
    lutNode.getTextureNode('higherOrderScattering'),
    camera,
    point,
    shadowLength,
    sunDirection
  ).toVar()

  const luminance = radianceTransfer
    .get('radiance')
    .mul(skyRadianceToLuminance.mul(luminanceScale))
  return luminanceTransferStruct(
    luminance,
    radianceTransfer.get('transmittance')
  )
})

const sunAndSkyIlluminanceStruct = /*#__PURE__*/ struct(
  {
    sunIlluminance: Illuminance3,
    skyIlluminance: Illuminance3
  },
  'sunAndSkyIlluminance'
)

export const getSunAndSkyIlluminance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Cannot resolve sampler uniforms
  name: 'getSunAndSkyIlluminance',
  type: sunAndSkyIlluminanceStruct,
  inputs: [
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'sunDirection', type: Direction }
  ]
})(([point, normal, sunDirection], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const {
    lutNode,
    sunRadianceToLuminance,
    skyRadianceToLuminance,
    luminanceScale
  } = context

  const sunSkyIrradiance = getSunAndSkyIrradiance(
    lutNode.getTextureNode('transmittance'),
    lutNode.getTextureNode('irradiance'),
    point,
    normal,
    sunDirection
  ).toVar()

  const sunIlluminance = sunSkyIrradiance
    .get('sunIrradiance')
    .mul(sunRadianceToLuminance.mul(luminanceScale))
  const skyIlluminance = sunSkyIrradiance
    .get('skyIrradiance')
    .mul(skyRadianceToLuminance.mul(luminanceScale))
  return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
})

export const getSkyIlluminance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Cannot resolve sampler uniforms
  name: 'getSkyIlluminance',
  type: Illuminance3,
  inputs: [
    { name: 'point', type: Position },
    { name: 'normal', type: Direction },
    { name: 'sunDirection', type: Direction }
  ]
})(([point, normal, sunDirection], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const { lutNode, skyRadianceToLuminance, luminanceScale } = context

  const sunSkyIrradiance = getSkyIrradiance(
    lutNode.getTextureNode('irradiance'),
    point,
    normal,
    sunDirection
  )
  return sunSkyIrradiance.mul(skyRadianceToLuminance.mul(luminanceScale))
})

// Added for the cloud particles.
export const getSunAndSkyScalarIlluminance = /*#__PURE__*/ FnLayout({
  typeOnly: true, // TODO: Cannot resolve sampler uniforms
  name: 'getSunAndSkyScalarIlluminance',
  type: sunAndSkyIlluminanceStruct,
  inputs: [
    { name: 'point', type: Position },
    { name: 'sunDirection', type: Direction }
  ]
})(([point, sunDirection], builder) => {
  const context = AtmosphereContextNode.get(builder)
  const {
    lutNode,
    sunRadianceToLuminance,
    skyRadianceToLuminance,
    luminanceScale
  } = context

  const sunSkyIrradiance = getSunAndSkyScalarIrradiance(
    lutNode.getTextureNode('transmittance'),
    lutNode.getTextureNode('irradiance'),
    point,
    sunDirection
  ).toVar()

  const sunIlluminance = sunSkyIrradiance
    .get('sunIrradiance')
    .mul(sunRadianceToLuminance.mul(luminanceScale))
  const skyIlluminance = sunSkyIrradiance
    .get('skyIrradiance')
    .mul(skyRadianceToLuminance.mul(luminanceScale))
  return sunAndSkyIlluminanceStruct(sunIlluminance, skyIlluminance)
})
