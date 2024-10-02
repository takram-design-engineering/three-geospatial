import { type MeshProps } from '@react-three/fiber'
import { forwardRef, memo, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { type Mesh } from 'three'

import { Rectangle } from '@geovanni/math'

import { IonTerrain } from './IonTerrain'
import { TerrainGeometry } from './TerrainGeometry'

export interface TerrainTileProps extends MeshProps {
  terrain: IonTerrain
  x: number
  y: number
  z: number
  computeVertexNormals?: boolean
}

export const TerrainTile = memo(
  forwardRef<Mesh<TerrainGeometry>, TerrainTileProps>(function TerrainTile(
    { terrain, x, y, z, computeVertexNormals = false, children, ...props },
    forwardedRef
  ) {
    // TODO: Replace with a more advanced cache.
    const data = suspend(async () => {
      try {
        return await terrain.fetchTile({ x, y, z })
      } catch (error) {
        console.error(error)
      }
    }, [IonTerrain, terrain.assetId, x, y, z])

    const { tilingScheme } = terrain
    const rectangle = useMemo(() => {
      const size = tilingScheme.getSize(z)
      const rect = tilingScheme.tileToRectangle({ x, y: size.y - y - 1, z })
      return new Rectangle(rect.west, rect.south, rect.east, rect.north)
    }, [tilingScheme, x, y, z])

    const geometry = useMemo(() => {
      if (data == null) {
        return
      }
      const geometry = new TerrainGeometry(data, rectangle)
      if (computeVertexNormals) {
        geometry.computeVertexNormals()
      }
      return geometry
    }, [data, rectangle, computeVertexNormals])

    useEffect(() => {
      return () => {
        geometry?.dispose()
      }
    }, [geometry])

    if (geometry == null) {
      return null
    }
    return (
      <mesh ref={forwardedRef} {...props}>
        <primitive object={geometry} />
        {children}
      </mesh>
    )
  })
)
