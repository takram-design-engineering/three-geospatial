import { type MeshProps } from '@react-three/fiber'
import { forwardRef, memo, useEffect, useRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { type BufferGeometry, type Mesh } from 'three'

import { type TileCoordinateLike } from '@geovanni/core'

import { type IonTerrain } from '../IonTerrain'
import { type TerrainGeometry } from '../TerrainGeometry'

export interface TerrainTileProps extends TileCoordinateLike, MeshProps {
  terrain: IonTerrain
  computeVertexNormals?: boolean
}

export const TerrainTile = memo(
  forwardRef<Mesh<TerrainGeometry>, TerrainTileProps>(function TerrainTile(
    { terrain, x, y, z, computeVertexNormals = false, children, ...props },
    forwardedRef
  ) {
    const ref = useRef<Mesh>(null)

    useEffect(() => {
      const mesh = ref.current
      if (mesh == null) {
        return
      }
      let geometry: BufferGeometry | undefined
      ;(async () => {
        const result = await terrain.createGeometry(
          { x, y, z },
          computeVertexNormals
        )
        mesh.geometry = result.geometry
        mesh.position.copy(result.position)
        geometry = result.geometry
      })().catch(error => {
        console.error(error)
      })
      return () => {
        geometry?.dispose()
      }
    }, [terrain, x, y, z, computeVertexNormals])

    return (
      <mesh ref={mergeRefs([ref, forwardedRef])} {...props}>
        {children}
      </mesh>
    )
  })
)
