import { frameId, nodeImmutable, screenCoordinate, vec3 } from 'three/tsl'
import {
  Data3DTexture,
  RedFormat,
  Texture3DNode,
  type NodeBuilder
} from 'three/webgpu'

import { DEFAULT_STBN_URL } from '../constants'
import { STBNLoader } from '../STBNLoader'
import { FnVar } from './FnVar'
import type { Node } from './node'

const emptyTexture = /*#__PURE__*/ (() => {
  const texture = new Data3DTexture(new Uint8Array(1))
  texture.format = RedFormat
  texture.needsUpdate = true
  return texture
})()

export class STBNTextureNode extends Texture3DNode {
  static DEFAULT_URL = DEFAULT_STBN_URL

  constructor() {
    super(emptyTexture)
  }

  override setup(builder: NodeBuilder): unknown {
    new STBNLoader()
      .loadAsync(STBNTextureNode.DEFAULT_URL)
      .then(texture => {
        this.value = texture
      })
      .catch((error: unknown) => {
        console.error(error)
      })
    return super.setup(builder)
  }
}

export const stbnTexture = /*#__PURE__*/ nodeImmutable(STBNTextureNode)

export const stbn = /*#__PURE__*/ FnVar((): Node<'float'> => {
  return stbnTexture
    .sample(vec3(screenCoordinate.xy, frameId.mod(64)).div(vec3(128, 128, 64)))
    .r.toConst('stbn')
}).once()()
