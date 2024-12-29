import { type Matrix4, type Texture, type Vector2 } from 'three'

export interface AtmosphereCompositeShadow {
  texture: Texture | null
  matrices: Matrix4[]
  cascades: Vector2[]
  far: number
}

export interface AtmosphereComposite {
  texture?: Texture | null
  shadow?: AtmosphereCompositeShadow
}
