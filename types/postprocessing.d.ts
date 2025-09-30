import type { Camera, Material } from 'three'

declare module 'postprocessing' {
  interface DepthMaskMaterial {
    fullscreenMaterial: Material
    copyCameraSettings: (camera: Camera) => void
  }
}
