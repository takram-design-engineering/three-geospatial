import { CopyMaterial } from 'postprocessing'
import { GLSL3 } from 'three'

import fragmentShader from './shaders/arrayCopy.frag?raw'

export class ArrayCopyMaterial extends CopyMaterial {
  constructor() {
    super()
    this.glslVersion = GLSL3
    this.fragmentShader = fragmentShader
  }
}
