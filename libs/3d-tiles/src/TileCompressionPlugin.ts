// See: https://github.com/NASA-AMMOS/3DTilesRendererJS/tree/master/example/src/plugins

import {
  BufferAttribute,
  MathUtils,
  Mesh,
  Vector3,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Material,
  type Scene
} from 'three'

import { type TypedArrayConstructor } from '@geovanni/core'

const vectorScratch = new Vector3()

function compressAttribute(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  arrayType: TypedArrayConstructor
): BufferAttribute | InterleavedBufferAttribute {
  if (
    ('isInterleavedBufferAttribute' in attribute &&
      attribute.isInterleavedBufferAttribute) ||
    attribute.array instanceof arrayType
  ) {
    return attribute
  }

  const signed =
    arrayType === Int8Array ||
    arrayType === Int16Array ||
    arrayType === Int32Array
  const minValue = signed ? -1 : 0

  // eslint-disable-next-line new-cap
  const array = new arrayType(attribute.count * attribute.itemSize)
  const newAttribute = new BufferAttribute(array, attribute.itemSize, true)
  const itemSize = attribute.itemSize
  const count = attribute.count
  for (let i = 0; i < count; ++i) {
    for (let j = 0; j < itemSize; ++j) {
      const v = MathUtils.clamp(attribute.getComponent(i, j), minValue, 1)
      newAttribute.setComponent(i, j, v)
    }
  }

  return newAttribute
}

function compressPositionAttribute(
  mesh: Mesh,
  arrayType: TypedArrayConstructor = Int16Array
): void {
  const geometry = mesh.geometry
  const attributes = geometry.attributes
  const attribute = attributes.position

  // skip if it's already compressed to the provided level
  if (
    ('isInterleavedBufferAttribute' in attribute &&
      attribute.isInterleavedBufferAttribute) ||
    attribute.array instanceof arrayType
  ) {
    return
  }

  // new attribute data
  // eslint-disable-next-line new-cap
  const array = new arrayType(attribute.count * attribute.itemSize)
  const newAttribute = new BufferAttribute(array, attribute.itemSize, false)
  const itemSize = attribute.itemSize
  const count = attribute.count

  // bounding box stride
  // TODO: the bounding box is computed every time even if it already exists because
  // it's possible that the encoded value is incorrect causing artifacts
  geometry.computeBoundingBox()

  const boundingBox = geometry.boundingBox
  if (boundingBox == null) {
    return
  }

  const { min, max } = boundingBox

  // array range
  const maxValue = 2 ** (8 * arrayType.BYTES_PER_ELEMENT - 1) - 1
  const minValue = -maxValue

  for (let i = 0; i < count; ++i) {
    for (let j = 0; j < itemSize; ++j) {
      const key = j === 0 ? 'x' : j === 1 ? 'y' : 'z'
      const bbMinValue = min[key]
      const bbMaxValue = max[key]

      // scale the geometry values to the integer range
      const v = MathUtils.mapLinear(
        attribute.getComponent(i, j),
        bbMinValue,
        bbMaxValue,
        minValue,
        maxValue
      )

      newAttribute.setComponent(i, j, v)
    }
  }

  // shift the mesh to the center of the bounds
  boundingBox.getCenter(vectorScratch)
  mesh.position.add(vectorScratch)

  // adjust the scale to accommodate the new geometry data range
  mesh.scale.x *= (0.5 * (max.x - min.x)) / maxValue
  mesh.scale.y *= (0.5 * (max.y - min.y)) / maxValue
  mesh.scale.z *= (0.5 * (max.z - min.z)) / maxValue

  attributes.position = newAttribute
  mesh.geometry.boundingBox = null
  mesh.geometry.boundingSphere = null

  mesh.updateMatrixWorld()
}

export interface TileCompressionPluginOptions {
  // Whether to generate normals if they don't already exist.
  generateNormals?: boolean

  // Whether to disable use of mipmaps since they are typically not necessary
  // with something like 3d tiles.
  disableMipmaps?: boolean

  // Whether to compress certain attributes.
  compressIndex?: boolean
  compressNormals?: boolean
  compressUvs?: boolean
  compressPosition?: boolean

  // The TypedArray type to use when compressing the attributes.
  uvType?: TypedArrayConstructor
  normalType?: TypedArrayConstructor
  positionType?: TypedArrayConstructor
}

export class TileCompressionPlugin {
  readonly options: Readonly<Required<TileCompressionPluginOptions>>

  constructor(options?: TileCompressionPluginOptions) {
    this.options = {
      generateNormals: false,
      disableMipmaps: true,
      compressIndex: true,
      compressNormals: true,
      compressUvs: true,
      compressPosition: false,
      uvType: Int8Array,
      normalType: Int8Array,
      positionType: Int16Array,
      ...options
    }
  }

  processTileModel(scene: Scene): void {
    const {
      generateNormals,
      disableMipmaps,
      compressIndex,
      compressUvs,
      compressNormals,
      compressPosition,
      uvType,
      normalType,
      positionType
    } = this.options

    scene.traverse(object => {
      if (!(object instanceof Mesh)) {
        return
      }

      // Handle materials
      if (object.material != null && disableMipmaps) {
        const material: Material = object.material
        for (const key in material) {
          const value = material[key as keyof Material] as Material & {
            isTexture?: boolean
            generateMipmaps?: boolean
          }
          if (value?.isTexture === true) {
            value.generateMipmaps = false
          }
        }
      }

      // Handle geometry attribute compression
      if (object.geometry != null) {
        const geometry: BufferGeometry = object.geometry
        const attributes = geometry.attributes
        if (compressUvs) {
          const { uv, uv1, uv2, uv3 } = attributes
          if (uv != null) {
            attributes.uv = compressAttribute(uv, uvType)
          }
          if (uv1 != null) {
            attributes.uv1 = compressAttribute(uv1, uvType)
          }
          if (uv2 != null) {
            attributes.uv2 = compressAttribute(uv2, uvType)
          }
          if (uv3 != null) {
            attributes.uv3 = compressAttribute(uv3, uvType)
          }
        }

        if (generateNormals && attributes.normals == null) {
          geometry.computeVertexNormals()
        }

        if (compressNormals && attributes.normals != null) {
          attributes.normals = compressAttribute(attributes.normals, normalType)
        }

        if (compressPosition) {
          compressPositionAttribute(object, positionType)
        }

        if (compressIndex && geometry.index != null) {
          const vertCount = attributes.position.count
          const index = geometry.index
          const type =
            vertCount > 65535
              ? Uint32Array
              : vertCount > 255
                ? Uint16Array
                : Uint8Array
          if (!(index.array instanceof type)) {
            // eslint-disable-next-line new-cap
            const array = new type(geometry.index.count)
            array.set(index.array)

            const attribute = new BufferAttribute(array, 1)
            geometry.setIndex(attribute)
          }
        }
      }
    })
  }
}
