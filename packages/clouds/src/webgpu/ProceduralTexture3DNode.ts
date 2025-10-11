import {
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  UnsignedByteType,
  Vector3
} from 'three'
import {
  Fn,
  If,
  instanceIndex,
  Return,
  textureStore,
  uvec3,
  vec3
} from 'three/tsl'
import {
  Storage3DTexture,
  TempNode,
  type Node,
  type NodeBuilder,
  type TextureNode
} from 'three/webgpu'

import {
  outputTexture3D,
  type NodeObject
} from '@takram/three-geospatial/webgpu'

export abstract class ProceduralTexture3DNode extends TempNode {
  static override get type(): string {
    return 'ProceduralTexture3DNode'
  }

  readonly texture = this.createStorage3DTexture()

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNode: TextureNode

  constructor(size = new Vector3(1)) {
    super(null)
    this._textureNode = outputTexture3D(this, this.texture)
    this.setSize(size.x, size.y, size.z)
  }

  protected createStorage3DTexture(name?: string): Storage3DTexture {
    const texture = new Storage3DTexture(1, 1, 1)
    texture.type = UnsignedByteType
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.wrapR = RepeatWrapping
    texture.colorSpace = NoColorSpace
    texture.generateMipmaps = false

    const typeName = (this.constructor as typeof Node).type
    texture.name = name != null ? `${typeName}.${name}` : typeName

    return texture
  }

  getTextureNode(): TextureNode {
    return this._textureNode
  }

  setSize(width: number, height: number, depth: number): this {
    this.texture.setSize(width, height, depth)
    return this
  }

  protected abstract setupOutputNode(
    uvw: NodeObject<'vec3'>,
    builder: NodeBuilder
  ): Node

  override setup(builder: NodeBuilder): unknown {
    const { width, height, depth } = this.texture

    const computeNode = Fn(() => {
      const id = instanceIndex
      const x = id.mod(width)
      const y = id.div(width).mod(height)
      const z = id.div(width * height)
      const size = uvec3(width, height, depth)
      If(uvec3(x, y, z).greaterThanEqual(size).any(), () => {
        Return()
      })
      const textureCoordinate = vec3(x, y, z)
      const uvw = textureCoordinate.add(0.5).div(vec3(width, height, depth))

      textureStore(
        this.texture,
        textureCoordinate,
        this.setupOutputNode(uvw, builder)
      )
    })().compute(width * height * depth, [4, 4, 4])

    void builder.renderer.compute(computeNode)

    return super.setup(builder)
  }

  override dispose(): void {
    this.texture.dispose()
    super.dispose()
  }
}
