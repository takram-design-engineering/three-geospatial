import {
  Data3DTexture,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  type LoadingManager
} from 'three'

import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_HEIGHT,
  STBN_TEXTURE_WIDTH
} from './constants'
import { DataTextureLoader } from './DataTextureLoader'
import { parseUint8Array } from './typedArrayParsers'

export class STBNLoader extends DataTextureLoader<Data3DTexture> {
  constructor(manager?: LoadingManager) {
    super(
      Data3DTexture,
      parseUint8Array,
      {
        format: RedFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        wrapS: RepeatWrapping,
        wrapT: RepeatWrapping,
        wrapR: RepeatWrapping,
        width: STBN_TEXTURE_WIDTH,
        height: STBN_TEXTURE_HEIGHT,
        depth: STBN_TEXTURE_DEPTH
      },
      manager
    )
  }
}
