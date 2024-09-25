import {
  extend,
  type BufferGeometryNode,
  type MaterialNode,
  type MeshProps
} from '@react-three/fiber'
import { forwardRef, useEffect, useRef } from 'react'
import { suspend } from 'suspend-react'
import { type Mesh } from 'three'

import { type IonTerrain } from './IonTerrain'
import {
  TerrainGeometry,
  type TerrainGeometryParameters
} from './TerrainGeometry'
import {
  TerrainMaterial,
  type TerrainMaterialParameters
} from './TerrainMaterial'

declare module '@react-three/fiber' {
  export interface ThreeElements {
    terrainMaterial: MaterialNode<TerrainMaterial, [TerrainMaterialParameters]>
    terrainGeometry: BufferGeometryNode<
      TerrainGeometry,
      [TerrainGeometryParameters]
    >
  }
}

extend({ TerrainMaterial, TerrainGeometry })

export interface TerrainTileProps extends MeshProps {
  terrain: IonTerrain
  x: number
  y: number
  z: number
}

export const TerrainTile = forwardRef<Mesh, TerrainTileProps>(
  ({ terrain, x, y, z, ...props }, forwardedRef) => {
    // TODO: Replace with a more advanced cache.
    const data = suspend(
      async () => await terrain.fetchTile({ x, y, z }),
      [terrain, terrain.assetId, x, y, z]
    )

    const geometryRef = useRef<TerrainGeometry>(null)
    useEffect(() => {
      geometryRef.current?.setData(data)
    }, [data])

    return (
      <mesh ref={forwardedRef} {...props}>
        <terrainGeometry ref={geometryRef} />
        <terrainMaterial />
      </mesh>
    )
  }
)
