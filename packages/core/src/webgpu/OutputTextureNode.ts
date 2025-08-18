import { nodeObject } from 'three/tsl'
import {
  TextureNode,
  type Node,
  type NodeBuilder,
  type Texture
} from 'three/webgpu'

import type { NodeObject } from './node'

declare module 'three/webgpu' {
  interface TextureNode {
    setUpdateMatrix: (value: boolean) => this
  }
}

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

  // @ts-expect-error Wrong use of "this" in the library type.
  override clone(): OutputTextureNode {
    return new OutputTextureNode(this.owner, this.value)
  }
}

export const outputTexture = (
  ...args: ConstructorParameters<typeof OutputTextureNode>
): NodeObject<OutputTextureNode> => nodeObject(new OutputTextureNode(...args))
