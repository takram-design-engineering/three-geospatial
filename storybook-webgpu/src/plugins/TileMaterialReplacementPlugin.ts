import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import { Mesh, type Texture } from 'three'
import { MeshBasicNodeMaterial, type NodeMaterial } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'

function replaceMaterials(
  mesh: Mesh,
  overrideMaterial: typeof NodeMaterial
): void {
  const material = mesh.material
  if (Array.isArray(material)) {
    throw new Error('Multiple materials are not supported yet.')
  }
  // eslint-disable-next-line new-cap
  const nodeMaterial = new overrideMaterial()
  if ('map' in material && material.map != null && 'map' in nodeMaterial) {
    reinterpretType<Texture | null>(material.map)
    reinterpretType<Texture | null>(nodeMaterial.map)
    nodeMaterial.map = material.map.clone()
  }
  mesh.material = nodeMaterial
  material.dispose()
}

export class TileMaterialReplacementPlugin {
  tiles?: TilesRenderer

  private readonly overrideMaterial: typeof NodeMaterial

  constructor(Material: typeof NodeMaterial = MeshBasicNodeMaterial) {
    this.overrideMaterial = Material
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        replaceMaterials(object, this.overrideMaterial)
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
        replaceMaterials(object, this.overrideMaterial)
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
