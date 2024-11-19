declare module 'n8ao' {
  import { type Pass } from 'postprocessing'
  import { type Camera, type Scene } from 'three'

  export class N8AOPostPass extends Pass {
    readonly configuration: Object
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    setSize(width: number, height: number): void
  }
}
