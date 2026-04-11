import type { Texture } from 'three'
import { TextureNode, type Node, type NodeBuilder } from 'three/webgpu'

import { reinterpretType } from '../types'

export class OutputTextureNode extends TextureNode {
  static get type(): string {
    return 'OutputTextureNode'
  }

  owner: Node

  constructor(owner: Node, texture: Texture) {
    super(texture)
    this.owner = owner

    // WORKAROUND: Missing method as of r182. Adding these in the module
    // augmentation breaks VSCode's auto completion.
    reinterpretType<
      typeof this & {
        setUpdateMatrix: (value: boolean) => void
      }
    >(this)
    this.setUpdateMatrix(false)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  override setup(builder: NodeBuilder) {
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
