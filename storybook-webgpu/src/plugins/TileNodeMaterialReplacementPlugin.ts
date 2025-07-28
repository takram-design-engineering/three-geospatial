import type { ElementProps } from '@react-three/fiber'
import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import {
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  type Material
} from 'three'
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type NodeMaterial
} from 'three/webgpu'

const materialMapping = new Map<
  new (...args: any[]) => Material,
  new (...args: any[]) => NodeMaterial
>([
  [MeshBasicMaterial, MeshBasicNodeMaterial],
  [MeshPhysicalMaterial, MeshPhysicalNodeMaterial]
])

function getReplacement(material: Material): NodeMaterial | undefined {
  const constructor = materialMapping.get(
    material.constructor as new (...args: any[]) => Material
  )
  return constructor != null ? new constructor() : undefined
}

function replaceMaterials(mesh: Mesh): void {
  const material = mesh.material
  if (Array.isArray(material)) {
    throw new Error('Multiple materials are not supported yet.')
  }
  const nodeMaterial = getReplacement(material)
  if (nodeMaterial != null) {
    // @ts-expect-error I don't now why this works, because there're no
    // documentation about this as of r178. Does a NodeMaterial lookup the "map"
    // property perhaps?
    nodeMaterial.map = material.map
    mesh.material = nodeMaterial
    material.dispose()
  }
}

function handleLoadModel({ scene }: TilesRendererEventMap['load-model']): void {
  scene.traverse(object => {
    if (object instanceof Mesh) {
      replaceMaterials(object)
    }
  })
}

export class TileNodeMaterialReplacementPlugin {
  readonly props: ElementProps<typeof Mesh>
  tiles?: TilesRenderer

  constructor(options?: ElementProps<typeof Mesh>) {
    this.props = { ...options }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        replaceMaterials(object)
      }
    })
    tiles.addEventListener('load-model', handleLoadModel)
  }

  // Plugin method
  dispose(): void {
    this.tiles?.removeEventListener('load-model', handleLoadModel)
  }
}
