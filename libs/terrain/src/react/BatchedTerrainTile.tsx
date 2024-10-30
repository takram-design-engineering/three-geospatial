import { type MeshProps } from '@react-three/fiber'
import { sumBy } from 'lodash'
import { forwardRef, memo, useEffect, useMemo } from 'react'
import { clear, suspend } from 'suspend-react'
import { BatchedMesh, Matrix4, Vector3 } from 'three'

import {
  isNotNullish,
  TileCoordinate,
  type TileCoordinateLike
} from '@geovanni/core'

import { type IonTerrain } from '../IonTerrain'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()

export interface BatchedTerrainTileProps extends TileCoordinateLike, MeshProps {
  terrain: IonTerrain
  depth: number
  computeVertexNormals?: boolean
}

export const BatchedTerrainTile = memo(
  forwardRef<BatchedMesh, BatchedTerrainTileProps>(function BatchedTerrainTile(
    {
      terrain,
      x,
      y,
      z,
      depth,
      computeVertexNormals = false,
      children,
      ...props
    },
    forwardedRef
  ) {
    const results = suspend(async () => {
      const promises = []
      const tile = new TileCoordinate(x, y, z)
      for (const child of tile.traverseChildren(depth, tile)) {
        promises.push(
          (async () => {
            try {
              return await terrain.createGeometry(
                { ...child },
                computeVertexNormals
              )
              // TODO: This is intended to ignore 404. We can look up the layer
              // definition in advance.
            } catch (error) {}
          })()
        )
      }
      return (await Promise.all(promises)).filter(isNotNullish)
    }, [terrain, x, y, z, depth])

    useEffect(() => {
      return () => {
        results.forEach(({ geometry }) => {
          geometry.dispose()
        })
      }
    }, [results])

    useEffect(() => {
      return () => {
        clear([terrain, x, y, z, depth])
      }
    }, [terrain, x, y, z, depth])

    const mesh = useMemo(() => {
      const vertexCount = sumBy(
        results,
        ({ geometry }) => geometry.getAttribute('position').count
      )
      const indexCount = sumBy(
        results,
        ({ geometry }) => geometry.index?.count ?? 0
      )
      return new BatchedMesh(results.length, vertexCount, indexCount)
    }, [results])

    useEffect(() => {
      return () => {
        mesh.dispose()
      }
    }, [mesh])

    useEffect(() => {
      // TODO: Perhaps geometries no longer needed (free to dispose) after
      // adding them to mesh.

      const meshPosition = results
        .reduce((sum, { position }) => sum.add(position), vectorScratch1)
        .divideScalar(results.length)

      for (const { geometry, position } of results) {
        const geometryId = mesh.addGeometry(geometry)
        mesh.addInstance(geometryId)
        mesh.setMatrixAt(
          geometryId,
          new Matrix4().makeTranslation(
            vectorScratch2.copy(position).sub(meshPosition)
          )
        )
      }
      mesh.position.copy(meshPosition)
    }, [mesh, results])

    return (
      <primitive object={mesh} ref={forwardedRef} {...props}>
        {children}
      </primitive>
    )
  })
)
