import {
  type DataArrayTexture,
  type Matrix4,
  type Texture,
  type Uniform,
  type Vector2
} from 'three'

export interface AtmosphereCompositeShadow {
  map: DataArrayTexture | null
  mapSize: Vector2
  intervals: Vector2[]
  matrices: Matrix4[]
  far: number | Uniform<number>
  topHeight: number | Uniform<number>
}

export interface AtmosphereComposite {
  texture?: Texture | null
  shadow?: AtmosphereCompositeShadow
  shadowLengthTexture?: Texture | null
}
