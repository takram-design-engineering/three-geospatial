import { Pass } from 'postprocessing'
import { Camera, Vector3, type Matrix4, type Vector2 } from 'three'

import { type CascadedShadowMaps } from './CascadedShadowMaps'
import { type CloudShape } from './CloudShape'
import { type CloudShapeDetail } from './CloudShapeDetail'
import { type LocalWeather } from './LocalWeather'

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
  localWeather: LocalWeather
  localWeatherVelocity: Vector2
  shape: CloudShape
  shapeVelocity: Vector3
  shapeDetail: CloudShapeDetail
  shapeDetailVelocity: Vector3
  shadow: CascadedShadowMaps
}

export abstract class CloudsPassBase extends Pass {
  readonly ellipsoidCenter!: Vector3
  readonly ellipsoidMatrix!: Matrix4
  readonly sunDirection!: Vector3
  readonly localWeather!: LocalWeather
  readonly localWeatherVelocity!: Vector2
  readonly shape!: CloudShape
  readonly shapeVelocity!: Vector3
  readonly shapeDetail!: CloudShapeDetail
  readonly shapeDetailVelocity!: Vector3
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
    this.shadow = shadow
  }

  get mainCamera(): Camera {
    return this._mainCamera
  }

  set mainCamera(value: Camera) {
    this._mainCamera = value
  }
}
