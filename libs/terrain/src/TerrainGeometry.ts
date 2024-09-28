import { type QuantizedMeshData } from '@here/quantized-mesh-decoder'
import {
  BufferAttribute,
  BufferGeometry,
  Sphere,
  Vector3,
  type TypedArray
} from 'three'
import invariant from 'tiny-invariant'

import { Cartographic, lerp, type Rectangle } from '@geovanni/core'

const cartographicScratch = new Cartographic()
const vectorScratch = new Vector3()

function createPositionAttribute(vertexData: Uint16Array): BufferAttribute {
  invariant(vertexData.length % 3 === 0)
  const array = new Int16Array(vertexData.length)
  const vertexCount = vertexData.length / 3
  const us = vertexData.subarray(0, vertexCount)
  const vs = vertexData.subarray(vertexCount, vertexCount * 2)
  const heights = vertexData.subarray(vertexCount * 2, vertexCount * 3)

  for (
    let index = 0, vertexIndex = 0;
    index < array.length;
    index += 3, ++vertexIndex
  ) {
    array[index] = us[vertexIndex]
    array[index + 1] = vs[vertexIndex]
    array[index + 2] = heights[vertexIndex]
  }
  return new BufferAttribute(array, 3, true)
}

function createProjectedPositionAttribute(
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
    cartographicScratch.longitude = lerp(west, east, u / 0x7fff)
    cartographicScratch.latitude = lerp(south, north, v / 0x7fff)
    cartographicScratch.height = lerp(minHeight, maxHeight, height / 0x7fff)
    const position = cartographicScratch.toVector(vectorScratch)
    array[index] = position.x
    array[index + 1] = position.y
    array[index + 2] = position.z
  }
  return new BufferAttribute(array, 3)
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

function createPackedEncodedNormalAttribute(
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

export class TerrainGeometry extends BufferGeometry {
  constructor(
    data: QuantizedMeshData,
    rectangle: Rectangle,
    projectToEllipsoid = true
  ) {
    super()

    const { header, vertexData, triangleIndices, extensions } = data
    if (vertexData == null || triangleIndices == null) {
      throw new Error()
    }

    const index = new BufferAttribute(triangleIndices, 1)
    this.setIndex(index)
    const position = projectToEllipsoid
      ? createProjectedPositionAttribute(vertexData, {
          rectangle,
          minHeight: data.header.minHeight,
          maxHeight: data.header.maxHeight
        })
      : createPositionAttribute(vertexData)
    this.setAttribute('position', position)
    const uv = createUvAttribute(position.array)
    this.setAttribute('uv', uv)

    if (extensions?.vertexNormals != null) {
      const normal = createPackedEncodedNormalAttribute(
        extensions.vertexNormals
      )
      this.setAttribute('packedOctNormal', normal)
    }

    if (projectToEllipsoid) {
      this.boundingSphere = new Sphere(
        new Vector3(
          header.boundingSphereCenterX,
          header.boundingSphereCenterY,
          header.boundingSphereCenterZ
        ),
        header.boundingSphereRadius
      )
    } else {
      this.boundingSphere = new Sphere(new Vector3(0.5, 0.5, 0.5), 0.5)
    }
  }
}
