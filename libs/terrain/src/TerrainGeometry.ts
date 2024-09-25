import { type QuantizedMeshData } from '@here/quantized-mesh-decoder'
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Sphere,
  Vector3,
  type TypedArray
} from 'three'
import invariant from 'tiny-invariant'

function createPositionAttribute(vertexData: Uint16Array): BufferAttribute {
  invariant(vertexData.length % 3 === 0)
  const array = new Int16Array(vertexData.length)
  const vertexCount = vertexData.length / 3
  const x = vertexData.subarray(0, vertexCount)
  const y = vertexData.subarray(vertexCount, vertexCount * 2)
  const z = vertexData.subarray(vertexCount * 2, vertexCount * 3)
  for (
    let index = 0, vertexIndex = 0;
    index < array.length;
    index += 3, ++vertexIndex
  ) {
    array[index] = x[vertexIndex]
    array[index + 1] = y[vertexIndex]
    array[index + 2] = z[vertexIndex]
  }
  return new BufferAttribute(array, 3, true)
}

function createUvAttribute(positionArray: TypedArray): BufferAttribute {
  invariant(positionArray.length % 3 === 0)
  const array = new Int16Array((positionArray.length / 3) * 2)
  for (
    let index = 0, positionIndex = 0;
    index < array.length;
    index += 2, positionIndex += 3
  ) {
    array[index] = positionArray[positionIndex]
    array[index + 1] = positionArray[positionIndex + 1]
  }
  return new BufferAttribute(array, 2, true)
}

function createNormalAttribute(vertexNormals: Uint8Array): BufferAttribute {
  const array = new Float32Array(vertexNormals.length / 2)
  for (
    let index = 0, normalIndex = 0;
    index < array.length;
    ++index, normalIndex += 2
  ) {
    const x = vertexNormals[normalIndex]
    const y = vertexNormals[normalIndex + 1]
    array[index] = 256 * x + y
  }
  return new BufferAttribute(array, 1)
}

export interface TerrainGeometryParameters {
  data?: QuantizedMeshData
}

export class TerrainGeometry extends BufferGeometry {
  constructor({ data }: TerrainGeometryParameters = {}) {
    super()
    this.setData(data)
  }

  setData(data?: QuantizedMeshData): void {
    const { vertexData, triangleIndices, extensions } = data ?? {}
    if (
      vertexData == null ||
      triangleIndices == null ||
      extensions?.vertexNormals == null
    ) {
      this.deleteAttribute('position')
      this.deleteAttribute('uv')
      this.deleteAttribute('encodedNormal')
      return
    }

    const position = createPositionAttribute(vertexData)
    this.setAttribute('position', position)
    const uv = createUvAttribute(position.array)
    this.setAttribute('uv', uv)
    const index = new BufferAttribute(triangleIndices, 1)
    this.setIndex(index)
    const normal = createNormalAttribute(extensions.vertexNormals)
    this.setAttribute('encodedNormal', normal)

    this.boundingBox = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))
    this.boundingSphere = this.boundingBox.getBoundingSphere(
      this.boundingSphere ?? new Sphere()
    )
  }
}
