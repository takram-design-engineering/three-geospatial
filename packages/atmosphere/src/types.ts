import {
  type DataArrayTexture,
  type Matrix4,
  type Texture,
  type Vector2
} from 'three'

export interface AtmosphereOverlay {
  map: Texture
}

export interface AtmosphereShadowLength {
  map: Texture
}

export interface AtmosphereShadow {
  map: DataArrayTexture
  mapSize: Vector2
  cascadeCount: number
  intervals: Vector2[]
  matrices: Matrix4[]
  inverseMatrices: Matrix4[]
  far: number
  topHeight: number
}
