import {
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  UnsignedByteType,
  Vector2
} from 'three'
import {
  Fn,
  If,
  instanceIndex,
  Return,
  textureStore,
  uvec2,
  vec2
} from 'three/tsl'
import {
  StorageTexture,
  TempNode,
  type Node,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'

import { outputTexture, type NodeObject } from '@takram/three-geospatial/webgpu'

export abstract class ProceduralTextureNode extends TempNode {
  static override get type(): string {
    return 'ProceduralTextureNode'
  }

  readonly texture = this.createStorageTexture()

  private readonly textureNode: TextureNode

  constructor(size = new Vector2(1)) {
    super(null)
    this.textureNode = outputTexture(this, this.texture)
    this.setSize(size.x, size.y)
  }

  protected createStorageTexture(name?: string): StorageTexture {
    const texture = new StorageTexture(1, 1)
    texture.type = UnsignedByteType
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.colorSpace = NoColorSpace
    texture.generateMipmaps = false

    const typeName = (this.constructor as typeof Node).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    return texture
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  setSize(width: number, height: number): this {
    this.texture.setSize(width, height, this.texture.depth)
    return this
  }

  protected abstract setupOutputNode(
    uv: NodeObject<'vec2'>,
    builder: NodeBuilder
  ): Node

  override setup(builder: NodeBuilder): unknown {
    const { width, height } = this.texture

    const computeNode = Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width)
      const size = uvec2(width, height)
      If(uvec2(x, y).greaterThanEqual(size).any(), () => {
        Return()
      })
      const textureCoordinate = vec2(x, y)
      const uv = textureCoordinate.add(0.5).div(vec2(width, height))

      textureStore(
        this.texture,
        textureCoordinate,
        this.setupOutputNode(uv, builder)
      )
    })().compute(width * height, [8, 8, 1])

    void builder.renderer.compute(computeNode)

    return super.setup(builder)
  }

  override dispose(): void {
    this.texture.dispose()
    super.dispose()
  }
}
