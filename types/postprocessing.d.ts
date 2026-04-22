import type { Camera } from 'three'

declare module 'postprocessing' {
  interface DepthMaskMaterial {
    copyCameraSettings: (camera: Camera) => void
  }
}
