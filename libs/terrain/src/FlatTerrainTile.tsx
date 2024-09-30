import { type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { DoubleSide, type Mesh } from 'three'

import { Rectangle } from '@geovanni/core'

import { FlatTerrainMaterial } from './FlatTerrainMaterial'
import { IonTerrain } from './IonTerrain'
import { TerrainGeometry } from './TerrainGeometry'

export interface FlatTerrainTileProps extends MeshProps {
  terrain: IonTerrain
  x: number
  y: number
  z: number
  heightScale?: number
}

export const FlatTerrainTile = forwardRef<Mesh, FlatTerrainTileProps>(
  function FlatTerrainTile(
    { terrain, x, y, z, heightScale = 1, ...props },
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
      const geometry = new TerrainGeometry(data, rectangle, false)
      geometry.computeVertexNormals()
      return geometry
    }, [data, rectangle])
    const material = useMemo(() => new FlatTerrainMaterial(), [])

    useEffect(() => {
      return () => {
        geometry.dispose()
      }
    }, [geometry])

    if (data == null) {
      return null
    }
    return (
      <mesh ref={forwardedRef} {...props}>
        <primitive object={geometry} />
        <primitive
          object={material}
          minHeight={data.header.minHeight}
          maxHeight={data.header.maxHeight}
          heightScale={heightScale}
          side={DoubleSide}
        />
      </mesh>
    )
  }
)
