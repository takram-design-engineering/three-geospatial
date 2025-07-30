import type { Camera } from 'three'
import {
  float,
  nodeObject,
  perspectiveDepthToViewZ,
  reference,
  viewZToOrthographicDepth
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import { turbo } from './Turbo'
import type { Node, ShaderNode } from './node'

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
  cameraNearNode: Node<'float'>
  cameraFarNode: Node<'float'>
  depthNode: Node<'float'>
  nearNode: Node<'float'>
  farNode: Node<'float'>

  constructor(
    camera: Camera,
    depthNode: ShaderNode<'float'>,
    near?: number | ShaderNode<'float'>,
    far?: number | ShaderNode<'float'>
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

  setup(builder: NodeBuilder): Node<'vec3'> {
    const {
      camera,
      depthNode: depth,
      cameraNearNode: cameraNear,
      cameraFarNode: cameraFar,
      nearNode: near,
      farNode: far
    } = this
    let node: ShaderNode<'float'>
    if (camera.isPerspectiveCamera === true) {
      const viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      node = viewZToOrthographicDepth(viewZ, near, far) as ShaderNode<'float'>
    } else {
      node = viewZToOrthographicDepth(depth, near, far) as ShaderNode<'float'>
    }
    return turbo(node.saturate().oneMinus())
  }
}

export const depthToColor = (
  ...params: ConstructorParameters<typeof DepthToColor>
): Node<'float'> => nodeObject(new DepthToColor(...params))
