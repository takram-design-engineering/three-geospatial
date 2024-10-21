import { Vector2, Vector3, type DataTexture } from 'three'
import invariant from 'tiny-invariant'

import { Ellipsoid, smoothstep } from '@geovanni/core'

import {
  ATMOSPHERE_PARAMETERS,
  METER_TO_UNIT_LENGTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'

const topRadius = ATMOSPHERE_PARAMETERS.topRadius * METER_TO_UNIT_LENGTH
const bottomRadius = ATMOSPHERE_PARAMETERS.bottomRadius * METER_TO_UNIT_LENGTH

function rayIntersectsGround(r: number, mu: number): boolean {
  return mu < 0 && r * r * (mu * mu - 1) + bottomRadius * bottomRadius >= 0
}

function safeSqrt(a: number): number {
  return Math.sqrt(Math.max(a, 0))
}

function clampDistance(d: number): number {
  return Math.max(d, 0)
}

function distanceToTopAtmosphereBoundary(r: number, mu: number): number {
  const discriminant = r * r * (mu * mu - 1) + topRadius * topRadius
  return clampDistance(-r * mu + safeSqrt(discriminant))
}

function getTextureCoordFromUnitRange(x: number, textureSize: number): number {
  return 0.5 / textureSize + x * (1 - 1 / textureSize)
}

function getTransmittanceTextureUvFromRMu(
  r: number,
  mu: number,
  result: Vector2
): Vector2 {
  const H = Math.sqrt(topRadius * topRadius - bottomRadius * bottomRadius)
  const rho = safeSqrt(r * r - bottomRadius * bottomRadius)
  const d = distanceToTopAtmosphereBoundary(r, mu)
  const dMin = topRadius - r
  const dMax = rho + H
  const xmu = (d - dMin) / (dMax - dMin)
  const xr = rho / H
  return result.set(
    getTextureCoordFromUnitRange(xmu, TRANSMITTANCE_TEXTURE_WIDTH),
    getTextureCoordFromUnitRange(xr, TRANSMITTANCE_TEXTURE_HEIGHT)
  )
}

const sampleScratch1 = /*#__PURE__*/ new Vector3()
const sampleScratch2 = /*#__PURE__*/ new Vector3()
const sampleScratch3 = /*#__PURE__*/ new Vector3()

function samplePixel(
  data: Float32Array,
  index: number,
  result: Vector3
): Vector3 {
  const dataIndex = index * 4 // Assume RGBA
  return result.set(data[dataIndex], data[dataIndex + 1], data[dataIndex + 2])
}

function sampleTexture(
  texture: DataTexture,
  uv: Vector2,
  result: Vector3
): Vector3 {
  const { data, width, height } = texture.image
  invariant(data instanceof Float32Array)
  const x = uv.x * width
  const y = uv.y * height
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = x - xi
  const ty = y - yi
  const sx = smoothstep(0, 1, tx)
  const sy = smoothstep(0, 1, ty)
  const rx0 = xi % width
  const rx1 = (rx0 + 1) % width
  const ry0 = yi % height
  const ry1 = (ry0 + 1) % height
  const v00 = samplePixel(data, ry0 * width + rx0, sampleScratch1)
  const v10 = samplePixel(data, ry0 * width + rx1, sampleScratch2)
  const nx0 = v00.lerp(v10, sx)
  const v01 = samplePixel(data, ry1 * width + rx0, sampleScratch2)
  const v11 = samplePixel(data, ry1 * width + rx1, sampleScratch3)
  const nx1 = v01.lerp(v11, sx)
  return result.copy(nx0.lerp(nx1, sy))
}

const uvScratch = /*#__PURE__*/ new Vector2()

function getTransmittanceToTopAtmosphereBoundary(
  transmittanceTexture: DataTexture,
  r: number,
  mu: number,
  result: Vector3
): Vector3 {
  const uv = getTransmittanceTextureUvFromRMu(r, mu, uvScratch)
  return sampleTexture(transmittanceTexture, uv, result)
}

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()

export interface SkyTransmittanceOptions {
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
}

export function computeSkyTransmittance(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  worldDirection: Vector3,
  {
    ellipsoid = Ellipsoid.WGS84,
    osculateEllipsoid = true
  }: SkyTransmittanceOptions = {},
  result = new Vector3()
): Vector3 {
  const camera = vectorScratch1
    .copy(worldPosition)
    .multiplyScalar(METER_TO_UNIT_LENGTH)

  if (osculateEllipsoid) {
    const earthCenter = vectorScratch2
    const surfacePosition = ellipsoid.projectOnSurface(
      worldPosition,
      undefined,
      vectorScratch2
    )
    if (surfacePosition != null) {
      ellipsoid
        .getOsculatingSphereCenter(
          surfacePosition,
          ATMOSPHERE_PARAMETERS.bottomRadius,
          earthCenter
        )
        .multiplyScalar(METER_TO_UNIT_LENGTH)
    }
    camera.sub(earthCenter)
  }

  let r = camera.length()
  let rmu = camera.dot(worldDirection)
  const distanceToTopAtmosphereBoundary =
    -rmu - Math.sqrt(rmu * rmu - r * r + topRadius * topRadius)
  if (distanceToTopAtmosphereBoundary > 0) {
    camera.add(
      vectorScratch2
        .copy(worldDirection)
        .multiplyScalar(distanceToTopAtmosphereBoundary)
    )
    r = topRadius
    rmu += distanceToTopAtmosphereBoundary
  } else if (r > topRadius) {
    return result.set(1, 1, 1)
  }
  const mu = rmu / r
  const rayRMuIntersectsGround = rayIntersectsGround(r, mu)
  return rayRMuIntersectsGround
    ? result.set(0, 0, 0)
    : getTransmittanceToTopAtmosphereBoundary(
        transmittanceTexture,
        r,
        mu,
        result
      )
}
