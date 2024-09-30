import { type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { type Mesh } from 'three'

import { Rectangle } from '@geovanni/core'

import { IonTerrain } from './IonTerrain'
import { TerrainGeometry } from './TerrainGeometry'

export interface TerrainTileProps extends MeshProps {
  terrain: IonTerrain
  x: number
  y: number
  z: number
  computeVertexNormals?: boolean
}

export const TerrainTile = forwardRef<Mesh<TerrainGeometry>, TerrainTileProps>(
  function TerrainTile(
    { terrain, x, y, z, computeVertexNormals = false, children, ...props },
    forwardedRef
  ) {
    // TODO: Replace with a more advanced cache.
    const data = suspend(
      async () => await terrain.fetchTile({ x, y, z }),
      [IonTerrain, terrain.assetId, x, y, z]
    )

    const { tilingScheme } = terrain
    const rectangle = useMemo(() => {
      const size = tilingScheme.getSize(z)
      const rect = tilingScheme.tileToRectangle({ x, y: size.y - y - 1, z })
      return new Rectangle(rect.west, rect.south, rect.east, rect.north)
    }, [tilingScheme, x, y, z])

    const geometry = useMemo(() => {
      const geometry = new TerrainGeometry(data, rectangle)
      if (computeVertexNormals) {
        geometry.computeVertexNormals()
      }
      return geometry
    }, [data, rectangle, computeVertexNormals])

    useEffect(() => {
      return () => {
        geometry.dispose()
      }
    }, [geometry])

    return (
      <mesh ref={forwardedRef} {...props}>
        <primitive object={geometry} />
        {children}
      </mesh>
    )
  }
)
