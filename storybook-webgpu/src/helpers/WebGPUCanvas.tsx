import { css } from '@emotion/react'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { useEffect, useRef, useState, type FC } from 'react'
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
}) => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    ;(async () => {
      const available =
        typeof navigator !== 'undefined' &&
        navigator.gpu !== undefined &&
        (await navigator.gpu.requestAdapter()) != null

      if (!available) {
        setVisible(true)
      }
    })().catch((error: unknown) => {
      console.error(error)
    })
  }, [])

  return (
    <>
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
      {visible && (
        <div
          css={css`
            position: absolute;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            font-size: small;
            letter-spacing: 0.025em;
            text-align: center;
          `}
        >
          Your browser does not support WebGPU yet.
          <br />
          Running under WebGL2 as a fallback.
        </div>
      )}
    </>
  )
}
