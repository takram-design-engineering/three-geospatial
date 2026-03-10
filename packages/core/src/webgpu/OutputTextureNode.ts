import type { Texture } from 'three'
import { TextureNode, type Node, type NodeBuilder } from 'three/webgpu'

export class OutputTextureNode extends TextureNode {
  static override get type(): string {
    return 'OutputTextureNode'
  }

  owner: Node

  constructor(owner: Node, texture: Texture) {
    super(texture)
    this.owner = owner
    this.setUpdateMatrix(false)
  }

  override setup(builder: NodeBuilder): unknown {
    this.owner.build(builder)
    return super.setup(builder)
  }

  override clone(): this {
    // @ts-expect-error Ignore
    return new this.constructor(this.owner, this.value)
  }
}

export const outputTexture = (
  ...args: ConstructorParameters<typeof OutputTextureNode>
): OutputTextureNode => new OutputTextureNode(...args)
