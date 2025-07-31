import { Canvas, type CanvasProps } from '@react-three/fiber'
import type { FC } from 'react'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.js'
import { WebGPURenderer } from 'three/webgpu'

export interface WebGPUCanvasProps extends Omit<CanvasProps, 'gl'> {
  renderer?: WebGPURendererParameters & {
    onInit?: (renderer: WebGPURenderer) => void | Promise<void>
  }
}

export const WebGPUCanvas: FC<WebGPUCanvasProps> = ({
  renderer: { onInit, ...otherProps } = {},
  ...canvasProps
}) => (
  <Canvas
    {...canvasProps}
    gl={async props => {
      const renderer = new WebGPURenderer({
        ...(props as any),
        ...otherProps,
        requiredLimits: {
          // Require enough bytes for FP32 x 3 attachments to compute the
          // atmosphere LUTs in the single-float precision.
          // TODO: Fallback to a non-MRT LUT generation, or in the half-float
          // precision if it's not supported.
          maxColorAttachmentBytesPerSample: 48,
          ...otherProps.requiredLimits
        }
      })
      await renderer.init()

      // Require the model-view matrix premultiplied on the CPU side.
      // See: https://github.com/mrdoob/three.js/issues/30955
      renderer.highPrecision = true

      await onInit?.(renderer)
      return renderer
    }}
  />
)
