import { Pass } from 'postprocessing'
import { Camera, Vector3, type Matrix4, type Vector2 } from 'three'

import { type CascadedShadowMaps } from './CascadedShadowMaps'
import { type Render3DTexture } from './Render3DTexture'
import { type RenderTexture } from './RenderTexture'

const vectorScratch = /*#__PURE__*/ new Vector3()

export function applyVelocity(
  velocity: Vector2 | Vector3,
  deltaTime: number,
  ...results: Array<Vector2 | Vector3>
): void {
  const delta = vectorScratch
    .fromArray(velocity.toArray())
    .multiplyScalar(deltaTime)
  for (let i = 0; i < results.length; ++i) {
    results[i].add(delta)
  }
}

export interface CloudsPassBaseOptions {
  ellipsoidCenter: Vector3
  ellipsoidMatrix: Matrix4
  sunDirection: Vector3
  localWeather: RenderTexture
  localWeatherVelocity: Vector2
  shape: Render3DTexture
  shapeVelocity: Vector3
  shapeDetail: Render3DTexture
  shapeDetailVelocity: Vector3
  turbulence: RenderTexture
  shadow: CascadedShadowMaps
}

export abstract class CloudsPassBase extends Pass {
  readonly ellipsoidCenter!: Vector3
  readonly ellipsoidMatrix!: Matrix4
  readonly sunDirection!: Vector3
  readonly localWeather!: RenderTexture
  readonly localWeatherVelocity!: Vector2
  readonly shape!: Render3DTexture
  readonly shapeVelocity!: Vector3
  readonly shapeDetail!: Render3DTexture
  readonly shapeDetailVelocity!: Vector3
  readonly turbulence!: RenderTexture
  shadow: CascadedShadowMaps

  private _mainCamera = new Camera()

  constructor(name: string, options: CloudsPassBaseOptions) {
    super(name)
    const {
      ellipsoidCenter,
      ellipsoidMatrix,
      sunDirection,
      localWeather,
      localWeatherVelocity,
      shape,
      shapeVelocity,
      shapeDetail,
      shapeDetailVelocity,
      turbulence,
      shadow
    } = options
    this.ellipsoidCenter = ellipsoidCenter
    this.ellipsoidMatrix = ellipsoidMatrix
    this.sunDirection = sunDirection
    this.localWeather = localWeather
    this.localWeatherVelocity = localWeatherVelocity
    this.shape = shape
    this.shapeVelocity = shapeVelocity
    this.shapeDetail = shapeDetail
    this.shapeDetailVelocity = shapeDetailVelocity
    this.turbulence = turbulence
    this.shadow = shadow
  }

  get mainCamera(): Camera {
    return this._mainCamera
  }

  set mainCamera(value: Camera) {
    this._mainCamera = value
  }
}
