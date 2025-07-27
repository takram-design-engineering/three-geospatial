import type { Camera, Vector3 } from 'three'
import {
  float,
  nodeObject,
  perspectiveDepthToViewZ,
  reference,
  viewZToOrthographicDepth
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import { turbo } from './Turbo'
import type { Node, ShaderNode } from './types'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export class DepthToColor extends TempNode {
  static get type(): string {
    return 'DepthToColor'
  }

  camera: Camera
  cameraNearNode: Node<number>
  cameraFarNode: Node<number>
  depthNode: Node<number>
  nearNode: Node<number>
  farNode: Node<number>

  constructor(
    camera: Camera,
    depthNode: ShaderNode<number>,
    near?: number | ShaderNode<number>,
    far?: number | ShaderNode<number>
  ) {
    super('vec3')
    this.camera = camera
    this.cameraNearNode = reference('near', 'float', camera)
    this.cameraFarNode = reference('far', 'float', camera)
    this.depthNode = depthNode
    this.nearNode =
      typeof near === 'number' ? float(near) : (near ?? this.cameraNearNode)
    this.farNode =
      typeof far === 'number' ? float(far) : (far ?? this.cameraFarNode)
  }

  setup(builder: NodeBuilder): Node<Vector3> {
    const {
      camera,
      depthNode: depth,
      cameraNearNode: cameraNear,
      cameraFarNode: cameraFar,
      nearNode: near,
      farNode: far
    } = this
    let node: ShaderNode<number>
    if (camera.isPerspectiveCamera === true) {
      const viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      node = viewZToOrthographicDepth(viewZ, near, far) as ShaderNode<number>
    } else {
      node = viewZToOrthographicDepth(depth, near, far) as ShaderNode<number>
    }
    return turbo(node.saturate().oneMinus())
  }
}

export const depthToColor = (
  ...params: ConstructorParameters<typeof DepthToColor>
): Node<number> => nodeObject(new DepthToColor(...params))
