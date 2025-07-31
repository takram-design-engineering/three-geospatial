import { BufferAttribute, BufferGeometry, Vector3 } from 'three'

export interface EllipsoidGeometryParameters {
  radii: Vector3
  longitudeSegments?: number
  latitudeSegments?: number
}

export class EllipsoidGeometry extends BufferGeometry {
  override readonly type = 'EllipsoidGeometry'

  parameters: EllipsoidGeometryParameters

  constructor(
    radii = new Vector3(1, 1, 1),
    longitudeSegments = 32,
    latitudeSegments = 16
  ) {
    super()
    this.parameters = {
      radii,
      longitudeSegments,
      latitudeSegments
    }

    longitudeSegments = Math.max(3, Math.floor(longitudeSegments))
    latitudeSegments = Math.max(2, Math.floor(latitudeSegments))

    const elementCount = (longitudeSegments + 1) * (latitudeSegments + 1)
    const vertex = new Vector3()
    const normal = new Vector3()
    const vertices = new Float32Array(elementCount * 3)
    const normals = new Float32Array(elementCount * 3)
    const uvs = new Float32Array(elementCount * 2)
    const grid: number[][] = []
    const indices: number[] = []

    // Vertices, normals and UVs
    for (
      let y = 0, vertexIndex = 0, uvIndex = 0, rowIndex = 0;
      y <= latitudeSegments;
      ++y
    ) {
      const rowIndices = []
      const v = y / latitudeSegments
      const phi = v * Math.PI

      // Special case for the poles
      let uOffset = 0
      if (y === 0) {
        uOffset = 0.5 / longitudeSegments
      } else if (y === latitudeSegments) {
        uOffset = -0.5 / longitudeSegments
      }

      for (
        let x = 0;
        x <= longitudeSegments;
        ++x, vertexIndex += 3, uvIndex += 2, ++rowIndex
      ) {
        const u = x / longitudeSegments
        const theta = u * Math.PI * 2
        vertex.x = radii.x * Math.cos(theta) * Math.sin(phi)
        vertex.y = radii.y * Math.sin(theta) * Math.sin(phi)
        vertex.z = radii.z * Math.cos(phi)
        vertices[vertexIndex] = vertex.x
        vertices[vertexIndex + 1] = vertex.y
        vertices[vertexIndex + 2] = vertex.z
        normal.copy(vertex).normalize()
        normals[vertexIndex] = normal.x
        normals[vertexIndex + 1] = normal.y
        normals[vertexIndex + 2] = normal.z
        uvs[uvIndex] = u + uOffset
        uvs[uvIndex + 1] = 1 - v
        rowIndices.push(rowIndex)
      }
      grid.push(rowIndices)
    }

    // Indices
    for (let y = 0; y < latitudeSegments; ++y) {
      for (let x = 0; x < longitudeSegments; ++x) {
        const a = grid[y][x + 1]
        const b = grid[y][x]
        const c = grid[y + 1][x]
        const d = grid[y + 1][x + 1]
        if (y !== 0) {
          indices.push(a, b, d)
        }
        if (y !== latitudeSegments - 1) {
          indices.push(b, c, d)
        }
      }
    }

    this.setIndex(indices)
    this.setAttribute('position', new BufferAttribute(vertices, 3))
    this.setAttribute('normal', new BufferAttribute(normals, 3))
    this.setAttribute('uv', new BufferAttribute(uvs, 2))
  }

  override copy(source: EllipsoidGeometry): this {
    super.copy(source)
    this.parameters = { ...source.parameters }
    return this
  }
}
