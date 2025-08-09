import styled from '@emotion/styled'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { atom, useAtomValue } from 'jotai'
import { Suspense, type FC } from 'react'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.js'
import { WebGPURenderer } from 'three/webgpu'

import type { RendererArgs } from '../controls/rendererControls'
import { useControl } from './useControl'

export const availableAtom = atom(
  async () =>
    typeof navigator !== 'undefined' &&
    navigator.gpu !== undefined &&
    (await navigator.gpu.requestAdapter()) != null
)

const MessageContainer = styled('div')`
  position: absolute;
  top: 16px;
  right: 16px;
  left: 16px;
  color: white;
  font-size: small;
  letter-spacing: 0.025em;
  text-align: center;
`

const Message: FC<{ forceWebGL: boolean }> = ({ forceWebGL }) => {
  const available = useAtomValue(availableAtom)
  if (!available) {
    return (
      <MessageContainer>
        Your browser does not support WebGPU yet. Running under WebGL2 as a
        fallback.
      </MessageContainer>
    )
  }
  if (forceWebGL) {
    return <MessageContainer>Running under WebGL2.</MessageContainer>
  }
  return null
}

export interface WebGPUCanvasProps extends Omit<CanvasProps, 'gl'> {
  renderer?: WebGPURendererParameters & {
    onInit?: (renderer: WebGPURenderer) => void | Promise<void>
  }
}

export const WebGPUCanvas: FC<WebGPUCanvasProps> = ({
  renderer: { onInit, ...otherProps } = {},
  ...canvasProps
}) => {
  const forceWebGL = useControl(({ forceWebGL }: RendererArgs) => forceWebGL)
  return (
    <>
      <Canvas
        key={forceWebGL ? 'webgl' : 'webgpu'}
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
            },
            forceWebGL
          })
          await renderer.init()

          // Require the model-view matrix premultiplied on the CPU side.
          // See: https://github.com/mrdoob/three.js/issues/30955
          renderer.highPrecision = true

          await onInit?.(renderer)
          return renderer
        }}
      />
      <Suspense>
        <Message forceWebGL={forceWebGL} />
      </Suspense>
    </>
  )
}
