import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import { Mesh, type Texture } from 'three'
import { MeshBasicNodeMaterial, type NodeMaterial } from 'three/webgpu'

import { assertType } from '@takram/three-geospatial'

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
    assertType<Texture | null>(material.map)
    assertType<Texture | null>(nodeMaterial.map)
    nodeMaterial.map = material.map.clone()
  }
  mesh.material = nodeMaterial
  material.dispose()
}

export class TileMaterialReplacementPlugin {
  readonly overrideMaterial: typeof NodeMaterial
  tiles?: TilesRenderer

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

  // Plugin method
  dispose(): void {
    this.tiles?.removeEventListener('load-model', this.handleLoadModel)
  }
}
