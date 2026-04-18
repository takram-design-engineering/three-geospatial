/* eslint-disable @typescript-eslint/class-methods-use-this */

import { vec3 } from 'three/tsl'
import { StorageTextureNode, type Node, type NodeBuilder } from 'three/webgpu'

// WORKAROUND: StorageTextureNode on Storage3DTexture breaks UV.
// TODO: File a PR in the upstream.
export class StorageTexture3DNode extends StorageTextureNode {
  static override get type(): string {
    return 'StorageTexture3DNode'
  }

  override getDefaultUV(): Node {
    return vec3(0.5, 0.5, 0.5)
  }

  setUpdateMatrix(_value: boolean): void {}

  generateUV(builder: NodeBuilder, uvNode: Node): string {
    return uvNode.build(builder, this.sampler ? 'vec3' : 'ivec3') as string
  }

  generateOffset(builder: NodeBuilder, offsetNode: Node): string {
    return offsetNode.build(builder, 'ivec3') as string
  }
}

export const storageTexture3D = (
  ...args: ConstructorParameters<typeof StorageTexture3DNode>
): StorageTexture3DNode => new StorageTexture3DNode(...args)
