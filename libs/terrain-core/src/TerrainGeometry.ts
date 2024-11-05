import { type QuantizedMeshData } from '@here/quantized-mesh-decoder'
import {
  BufferAttribute,
  BufferGeometry,
  Sphere,
  Vector3,
  type TypedArray
} from 'three'
import invariant from 'tiny-invariant'

import { Geodetic, lerp, type Rectangle } from '@geovanni/core'

import { decodeOctNormal } from './decodeOctNormal'

const geodeticScratch = /*#__PURE__*/ new Geodetic()
const vectorScratch = /*#__PURE__*/ new Vector3()

export class TerrainGeometry extends BufferGeometry {
  position: Vector3

  constructor(
    readonly data: QuantizedMeshData,
    rectangle: Rectangle
  ) {
    super()

    const { header, vertexData, triangleIndices, extensions } = data
    if (vertexData == null || triangleIndices == null) {
      throw new Error()
    }

    this.position = new Vector3(
      header.boundingSphereCenterX,
      header.boundingSphereCenterY,
      header.boundingSphereCenterZ
    )

    const index = new BufferAttribute(triangleIndices, 1)
    this.setIndex(index)
    const position = this.createPositionAttribute(vertexData, {
      rectangle,
      minHeight: data.header.minHeight,
      maxHeight: data.header.maxHeight
    })
    this.setAttribute('position', position)
    const uv = this.createUvAttribute(position.array)
    this.setAttribute('uv', uv)

    if (extensions?.vertexNormals != null) {
      const normal = this.createPackedEncodedNormalAttribute(
        extensions.vertexNormals
      )
      this.setAttribute('packedOctNormal', normal)
    }
  }

  override computeBoundingSphere(): void {
    const { header } = this.data
    this.boundingSphere = new Sphere(new Vector3(), header.boundingSphereRadius)
  }

  override computeVertexNormals(): void {
    const vertexNormals = this.data.extensions?.vertexNormals
    if (vertexNormals == null) {
      super.computeVertexNormals()
      return
    }
    const array = new Float32Array((vertexNormals.length / 2) * 3)
    for (
      let index = 0, normalIndex = 0;
      index < array.length;
      index += 3, normalIndex += 2
    ) {
      const x = vertexNormals[normalIndex]
      const y = vertexNormals[normalIndex + 1]
      const normal = decodeOctNormal(x, y, vectorScratch)
      array[index] = normal.x
      array[index + 1] = normal.y
      array[index + 2] = normal.z
    }
    const attribute = new BufferAttribute(array, 3)
    this.setAttribute('normal', attribute)
    this.normalizeNormals()
  }

  createPositionAttribute(
    vertexData: Uint16Array,
    params: {
      rectangle: Rectangle
      minHeight: number
      maxHeight: number
    }
  ): BufferAttribute {
    invariant(vertexData.length % 3 === 0)
    const array = new Float32Array(vertexData.length)
    const vertexCount = vertexData.length / 3
    const us = vertexData.subarray(0, vertexCount)
    const vs = vertexData.subarray(vertexCount, vertexCount * 2)
    const heights = vertexData.subarray(vertexCount * 2, vertexCount * 3)

    const { rectangle, minHeight, maxHeight } = params
    const { west, south, east, north } = rectangle
    for (
      let index = 0, vertexIndex = 0;
      index < array.length;
      index += 3, ++vertexIndex
    ) {
      const u = us[vertexIndex]
      const v = vs[vertexIndex]
      const height = heights[vertexIndex]
      geodeticScratch.longitude = lerp(west, east, u / 0x7fff)
      geodeticScratch.latitude = lerp(south, north, v / 0x7fff)
      geodeticScratch.height = lerp(minHeight, maxHeight, height / 0x7fff)
      const position = geodeticScratch.toECEF(vectorScratch).sub(this.position)
      array[index] = position.x
      array[index + 1] = position.y
      array[index + 2] = position.z
    }
    return new BufferAttribute(array, 3)
  }

  createUvAttribute(positionArray: TypedArray): BufferAttribute {
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

  createPackedEncodedNormalAttribute(
    vertexNormals: Uint8Array
  ): BufferAttribute {
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
}
