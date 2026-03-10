import type { Texture } from 'three'
import { Texture3DNode, type Node, type NodeBuilder } from 'three/webgpu'

export class OutputTexture3DNode extends Texture3DNode {
  static override get type(): string {
    return 'OutputTexture3DNode'
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

export const outputTexture3D = (
  ...args: ConstructorParameters<typeof OutputTexture3DNode>
): OutputTexture3DNode => new OutputTexture3DNode(...args)
