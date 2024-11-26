declare module '@here/quantized-mesh-decoder' {
  export type IndexArray = Uint16Array | Uint32Array

  export interface QuantizedMeshHeader {
    centerX: number
    centerY: number
    centerZ: number
    minHeight: number
    maxHeight: number
    boundingSphereCenterX: number
    boundingSphereCenterY: number
    boundingSphereCenterZ: number
    boundingSphereRadius: number
    horizonOcclusionPointX: number
    horizonOcclusionPointY: number
    horizonOcclusionPointZ: number
  }

  export interface QuantizedMeshData {
    header: QuantizedMeshHeader
    vertexData?: Uint16Array
    triangleIndices?: IndexArray
    westIndices?: IndexArray
    northIndices?: IndexArray
    eastIndices?: IndexArray
    southIndices?: IndexArray
    extensions?: {
      vertexNormals?: Uint8Array
      waterMask?: ArrayBuffer
      metadata?: unknown
    }
  }

  function decode(data: ArrayBuffer, userOptions?: Object): QuantizedMeshData

  export default decode
}
