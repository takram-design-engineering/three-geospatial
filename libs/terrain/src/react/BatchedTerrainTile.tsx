import { type MeshProps } from '@react-three/fiber'
import { forwardRef, memo, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { type BatchedMesh } from 'three'

import { isNotNullish, Rectangle, TileCoordinate } from '@geovanni/core'

import { BatchedTerrainMesh } from '../BatchedTerrainMesh'
import { IonTerrain } from '../IonTerrain'
import { TerrainGeometry } from '../TerrainGeometry'

export interface BatchedTerrainTileProps extends MeshProps {
  terrain: IonTerrain
  x: number
  y: number
  z: number
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
    const tiles = useMemo(() => {
      let tiles = [new TileCoordinate(x, y, z)]
      for (let i = 0; i < depth; ++i) {
        tiles = tiles.flatMap(tile => tile.getChildren())
      }
      return tiles
    }, [x, y, z, depth])

    // TODO: Replace with a more advanced cache.
    const dataArray = suspend(async () => {
      return await Promise.all(
        tiles.map(async tile => {
          try {
            return await terrain.fetchTile(tile)
          } catch (error) {
            console.error(error)
          }
        })
      )
    }, [IonTerrain, terrain.assetId, x, y, z, depth])

    const { tilingScheme } = terrain
    const rectangles = useMemo(
      () =>
        tiles.map(({ x, y, z }) => {
          const size = tilingScheme.getSize(z)
          const rect = tilingScheme.tileToRectangle({
            x,
            y: size.y - y - 1,
            z
          })
          return new Rectangle(rect.west, rect.south, rect.east, rect.north)
        }),
      [tilingScheme, tiles]
    )

    const geometries = useMemo(
      () =>
        dataArray.map((data, index) => {
          if (data == null) {
            return undefined
          }
          const rectangle = rectangles[index]
          const geometry = new TerrainGeometry(data, rectangle)
          if (computeVertexNormals) {
            geometry.computeVertexNormals()
          }
          return geometry
        }),
      [dataArray, rectangles, computeVertexNormals]
    )
    useEffect(() => {
      return () => {
        for (const geometry of geometries) {
          geometry?.dispose()
        }
      }
    }, [geometries])

    const mesh = useMemo(
      () => new BatchedTerrainMesh(geometries.filter(isNotNullish)),
      [geometries]
    )
    useEffect(() => {
      return () => {
        mesh.dispose()
      }
    }, [mesh])

    return (
      <primitive object={mesh} ref={forwardedRef} {...props}>
        {children}
      </primitive>
    )
  })
)
