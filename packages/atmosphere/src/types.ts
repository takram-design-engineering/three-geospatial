import type {
  Data3DTexture,
  DataArrayTexture,
  Matrix4,
  Texture,
  Vector2
} from 'three'

export interface PrecomputedTextures {
  irradianceTexture: Texture
  scatteringTexture: Data3DTexture
  transmittanceTexture: Texture
  singleMieScatteringTexture?: Data3DTexture
  higherOrderScatteringTexture?: Data3DTexture
}

export interface AtmosphereOverlay {
  map: Texture
}

export interface AtmosphereShadowLength {
  map: Texture
}

export interface AtmosphereOverlayShadow {
  map: DataArrayTexture
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

export interface AtmosphereSceneShadow {
  maps: Array<Texture | null>
  cascadeCount: number
  intervals: Vector2[]
  matrices: Matrix4[]
  inverseMatrices: Matrix4[]
  far: number
}
