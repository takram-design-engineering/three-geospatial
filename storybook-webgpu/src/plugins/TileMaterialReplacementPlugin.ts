import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import { Mesh, type Material, type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'

function replaceMaterials(mesh: Mesh, materialHandler: () => Material): void {
  const prevMaterial = mesh.material
  if (Array.isArray(prevMaterial)) {
    throw new Error('Multiple materials are not supported yet.')
  }

  const nextMaterial = materialHandler()
  if (
    'map' in prevMaterial &&
    prevMaterial.map != null &&
    'map' in nextMaterial
  ) {
    reinterpretType<Texture | null>(prevMaterial.map)
    reinterpretType<Texture | null>(nextMaterial.map)
    nextMaterial.map = prevMaterial.map.clone()
  }

  mesh.material = nextMaterial
  prevMaterial.dispose()
}

const defaultMaterial = (): Material => new MeshBasicNodeMaterial()

export class TileMaterialReplacementPlugin {
  tiles?: TilesRenderer

  private readonly materialHandler: () => Material

  constructor(materialHandler: () => Material = defaultMaterial) {
    this.materialHandler = materialHandler
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        replaceMaterials(object, this.materialHandler)
      }
    })
    tiles.addEventListener('load-model', this.handleLoadModel)
    tiles.addEventListener('dispose-model', this.handleDisposeModel)
  }

  private readonly handleLoadModel = ({
    scene
  }: TilesRendererEventMap['load-model']): void => {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        replaceMaterials(object, this.materialHandler)
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private readonly handleDisposeModel = ({
    scene
  }: TilesRendererEventMap['dispose-model']): void => {
    scene.traverse(object => {
      if (object instanceof Mesh) {
        object.material.dispose()
      }
    })
  }

  // Plugin method
  dispose(): void {
    this.tiles?.removeEventListener('load-model', this.handleLoadModel)
    // TODO: This leaks the materials already replaced.
    this.tiles?.removeEventListener('dispose-model', this.handleDisposeModel)
  }
}
