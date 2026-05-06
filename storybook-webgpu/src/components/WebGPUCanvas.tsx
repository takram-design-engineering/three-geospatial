import styled from '@emotion/styled'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { atom, useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, type FC, type MouseEvent } from 'react'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.js'
import { WebGPURenderer, type Renderer } from 'three/webgpu'

import type { RendererArgs } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { Stats } from './Stats'

export const availableAtom = atom(
  async () =>
    typeof navigator !== 'undefined' &&
    navigator.gpu !== undefined &&
    (await navigator.gpu.requestAdapter()) != null
)

const MessageElement = styled('div')`
  position: absolute;
  top: 16px;
  right: 16px;
  left: 16px;
  color: white;
  font-size: small;
  letter-spacing: 0.02em;
  text-align: center;
`

const Message: FC<{ forceWebGL: boolean }> = ({ forceWebGL }) => {
  const available = useAtomValue(availableAtom)
  if (!available) {
    return (
      <MessageElement>
        Your browser does not support WebGPU yet. Running under WebGL2 as a
        fallback.
      </MessageElement>
    )
  }
  if (forceWebGL) {
    return <MessageElement>Running under WebGL2.</MessageElement>
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
  children,
  onClick,
  ...canvasProps
}) => {
  const available = useAtomValue(availableAtom)
  let forceWebGL = useControl(({ forceWebGL }: RendererArgs) => forceWebGL)
  forceWebGL ||= !available
  const pixelRatio = useControl(({ pixelRatio }: RendererArgs) => pixelRatio)
  const frameloop = useControl(({ frameloop }: RendererArgs) => frameloop)

  const ref = useRef<Renderer>(null)
  useEffect(() => {
    return () => {
      // WORKAROUND: Renderer won't be disposed when used in Storybook.
      setTimeout(() => {
        ref.current?.dispose()
      }, 500)
    }
  }, [])

  // Focus the iframe in Storybook so that keyboard events can be captured.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      window.focus()
      onClick?.(event)
    },
    [onClick]
  )

  return (
    <>
      <Canvas
        key={forceWebGL ? 'webgl' : 'webgpu'}
        frameloop={frameloop}
        {...canvasProps}
        gl={async props => {
          const renderer = new WebGPURenderer({
            ...(props as any),
            ...otherProps,
            forceWebGL
          })
          ref.current = renderer
          await renderer.init()

          // Require the model-view matrix premultiplied on the CPU side.
          // See: https://github.com/mrdoob/three.js/issues/30955
          renderer.highPrecision = true

          await onInit?.(renderer)
          return renderer
        }}
        dpr={pixelRatio}
        onClick={handleClick}
      >
        {children}
        <Stats />
      </Canvas>
      <Message forceWebGL={forceWebGL} />
    </>
  )
}
