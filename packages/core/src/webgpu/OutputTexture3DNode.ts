import { nodeObject } from 'three/tsl'
import {
  Texture3DNode,
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
): NodeObject<OutputTexture3DNode> =>
  nodeObject(new OutputTexture3DNode(...args))
