// cSpell:words minzoom maxzoom

export interface AvailabilityRectangle {
  startX: number
  startY: number
  endX: number
  endY: number
}

// Reference: https://cesium.com/learn/cesium-native/ref-doc/structCesiumQuantizedMeshTerrain_1_1LayerSpec.html
export interface TerrainLayer {
  attribution: string
  available: readonly AvailabilityRectangle[][]
  bounds: readonly [number, number, number, number] // west, south, east, north in degrees
  description: string
  extensions: string[]
  format: string
  minzoom: number
  maxzoom: number
  metadataAvailability: number
  name: string
  projection: string
  scheme: string
  tiles: string[]
  version: string
}
