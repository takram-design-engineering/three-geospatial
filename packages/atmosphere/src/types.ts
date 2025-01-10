import {
  type DataArrayTexture,
  type Matrix4,
  type Texture,
  type Vector2
} from 'three'

export interface AtmosphereCompositeShadow {
  texture: DataArrayTexture | null
  intervals: Vector2[]
  matrices: Matrix4[]
  far: number
}

export interface AtmosphereComposite {
  texture?: Texture | null
  shadow?: AtmosphereCompositeShadow
}
