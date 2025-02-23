import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'

export interface BufferGeometryLike
  extends Pick<
    BufferGeometry,
    'attributes' | 'index' | 'boundingBox' | 'boundingSphere'
  > {}

export function toBufferGeometryLike(
  geometry: BufferGeometry
): [BufferGeometryLike, ArrayBuffer[]] {
  const { attributes, index, boundingBox, boundingSphere } = geometry
  return [
    { attributes, index, boundingBox, boundingSphere },
    [
      ...Object.values(geometry.attributes).map(
        attribute => attribute.array.buffer
      ),
      geometry.index?.array.buffer
    ].filter(buffer => buffer != null)
  ]
}

export function fromBufferGeometryLike(
  input: BufferGeometryLike,
  result = new BufferGeometry()
): BufferGeometry {
  for (const [name, attribute] of Object.entries(input.attributes)) {
    result.setAttribute(
      name,
      new BufferAttribute(
        attribute.array,
        attribute.itemSize,
        attribute.normalized
      )
    )
  }
  result.index =
    input.index != null
      ? new BufferAttribute(
          input.index.array,
          input.index.itemSize,
          input.index.normalized
        )
      : null
  if (input.boundingBox != null) {
    const { min, max } = input.boundingBox
    result.boundingBox = new Box3(
      new Vector3(min.x, min.y, min.z),
      new Vector3(max.x, max.y, max.z)
    )
  }
  if (input.boundingSphere != null) {
    const { center, radius } = input.boundingSphere
    result.boundingSphere = new Sphere(
      new Vector3(center.x, center.y, center.z),
      radius
    )
  }
  return result
}
