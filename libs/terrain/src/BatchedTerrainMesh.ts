import { BatchedMesh } from 'three'

import { type TerrainGeometry } from './TerrainGeometry'

export class BatchedTerrainMesh extends BatchedMesh {
  constructor(readonly geometries: readonly TerrainGeometry[]) {
    const vertexCount = geometries.reduce(
      (sum, geometry) => sum + geometry.getAttribute('position').count,
      0
    )
    const indexCount = geometries.reduce(
      (sum, geometry) => sum + (geometry.index?.count ?? 0),
      0
    )
    super(geometries.length, vertexCount, indexCount)
    for (let i = 0; i < geometries.length; ++i) {
      const id = this.addGeometry(geometries[i])
      this.addInstance(id)
    }
  }
}
