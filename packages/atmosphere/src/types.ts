import {
  type Data3DTexture,
  type DataArrayTexture,
  type Matrix4,
  type Texture,
  type Vector2
} from 'three'

export interface PrecomputedTextures {
  irradianceTexture: Texture
  scatteringTexture: Data3DTexture
  higherOrderScatteringTexture?: Data3DTexture
  transmittanceTexture: Texture
}

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

export interface AtmosphereLightingMask {
  map: Texture
  channel: 'r' | 'g' | 'b' | 'a'
}
