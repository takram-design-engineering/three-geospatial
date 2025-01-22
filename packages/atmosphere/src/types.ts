import {
  type DataArrayTexture,
  type Matrix4,
  type Texture,
  type Uniform,
  type Vector2
} from 'three'

export interface AtmosphereComposite {
  map: Texture
}

export interface AtmosphereShadowLength {
  map: Texture
}

export interface AtmosphereShadow {
  map: DataArrayTexture
  mapSize: Vector2
  intervals: Vector2[]
  matrices: Matrix4[]
  far: number | Uniform<number>
  topHeight: number | Uniform<number>
}
