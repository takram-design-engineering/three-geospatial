import { Canvas, type CanvasProps } from '@react-three/fiber'
import type { FC } from 'react'
import { NoToneMapping, WebGPURenderer } from 'three/webgpu'

export const WebGPUCanvas: FC<CanvasProps> = props => (
  <Canvas
    {...props}
    gl={async props => {
      const renderer = new WebGPURenderer({
        ...(props as any),
        requiredLimits: {
          maxColorAttachmentBytesPerSample: 48
        }
      })
      await renderer.init()
      setTimeout(() => {
        // R3F overrides configurations.
        renderer.toneMapping = NoToneMapping
      })
      return renderer
    }}
  />
)
