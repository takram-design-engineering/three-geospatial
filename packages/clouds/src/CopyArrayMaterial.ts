import { CopyMaterial } from 'postprocessing'
import { GLSL3 } from 'three'

import fragmentShader from './shaders/copyArray.frag?raw'

export class CopyArrayMaterial extends CopyMaterial {
  constructor() {
    super()
    this.glslVersion = GLSL3
    this.fragmentShader = fragmentShader
  }
}
