import { type MeshProps } from '@react-three/fiber'
import { sumBy } from 'lodash'
import { forwardRef, memo, useEffect, useMemo } from 'react'
import { clear, suspend } from 'suspend-react'
import { BatchedMesh } from 'three'

import {
  isNotNullish,
  TileCoordinate,
  type TileCoordinateLike
} from '@geovanni/core'

import { type IonTerrain } from '../IonTerrain'

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
    const geometries = suspend(async () => {
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
        geometries.forEach(geometry => {
          geometry.dispose()
        })
      }
    }, [geometries])

    useEffect(() => {
      return () => {
        clear([terrain, x, y, z, depth])
      }
    }, [terrain, x, y, z, depth])

    const mesh = useMemo(() => {
      const vertexCount = sumBy(
        geometries,
        geometry => geometry.getAttribute('position').count
      )
      const indexCount = sumBy(
        geometries,
        geometry => geometry.index?.count ?? 0
      )
      return new BatchedMesh(geometries.length, vertexCount, indexCount)
    }, [geometries])

    useEffect(() => {
      return () => {
        mesh.dispose()
      }
    }, [mesh])

    useEffect(() => {
      // TODO: Perhaps geometries no longer needed after adding them to mesh.
      for (const geometry of geometries) {
        const geometryId = mesh.addGeometry(geometry)
        mesh.addInstance(geometryId)
      }
    }, [mesh, geometries])

    return (
      <primitive object={mesh} ref={forwardedRef} {...props}>
        {children}
      </primitive>
    )
  })
)