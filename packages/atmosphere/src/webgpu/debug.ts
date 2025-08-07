import { positionGeometry, vec4 } from 'three/tsl'
import {
  Camera,
  Mesh,
  NodeMaterial,
  Scene,
  type Node,
  type Renderer
} from 'three/webgpu'

import { QuadGeometry } from '@takram/three-geospatial'

export function debugShader(renderer: Renderer, node: Node): void {
  const material = new NodeMaterial()
  material.vertexNode = vec4(positionGeometry.xy, 0, 1)
  material.fragmentNode = node

  const mesh = new Mesh(new QuadGeometry(), material)

  renderer.debug
    .getShaderAsync(new Scene(), new Camera(), mesh)
    .then(result => {
      console.log(result.fragmentShader)
    })
    .catch((error: unknown) => {
      console.error(error)
    })
    .finally(() => {
      material.dispose()
      mesh.geometry.dispose()
    })
}
