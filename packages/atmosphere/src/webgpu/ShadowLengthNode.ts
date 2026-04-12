import { TempNode, type DirectionalLight, type TextureNode } from 'three/webgpu'

export class ShadowLengthNode extends TempNode {
  static override get type(): string {
    return 'ShadowLengthNode'
  }

  depthNode: TextureNode
  shadowMapNode: TextureNode
  light: DirectionalLight

  constructor(
    depthNode: TextureNode,
    shadowMapNode: TextureNode,
    light: DirectionalLight
  ) {
    super('float')

    this.depthNode = depthNode
    this.shadowMapNode = shadowMapNode
    this.light = light
  }
}
