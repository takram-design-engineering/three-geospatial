import styled from '@emotion/styled'
import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type FC
} from 'react'
import { CanvasTarget, OrthographicCamera, RendererUtils } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { HistogramMesh } from '../HistogramMesh'
import type { VideoSource } from '../VideoSource'

const { resetRendererState, restoreRendererState } = RendererUtils

const Root = /*#__PURE__*/ styled.div`
  width: 480px;
  height: 360px;
  min-width: 240px;
  // BUG: CanvasTarget throws error when resized.
  flex-grow: 0;
  flex-shrink: 0;
  user-select: none;
`

const Content = /*#__PURE__*/ styled.div`
  --insets: 30px;
  --insets-left: 50px;

  position: relative;
  width: calc(100% - var(--insets) - var(--insets-left));
  height: calc(100% - var(--insets) * 2);
  margin: var(--insets);
  margin-left: var(--insets-left);
`

const Canvas = /*#__PURE__*/ styled.canvas`
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  mix-blend-mode: screen;
`

const Svg = /*#__PURE__*/ styled.svg`
  overflow: visible;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  font-size: 10px;
`

const Grid = /*#__PURE__*/ memo(() => (
  <Svg>
    <rect x={0} y={0} width='100%' height='100%' fill='black' stroke='#333' />
    {[0, 25, 50, 75, 100].map(value => {
      const x = value
      return (
        <Fragment key={value}>
          <line x1={`${x}%`} x2={`${x}%`} y1='0%' y2='100%' stroke='#333' />
          <text x={`${x}%`} y={-5} fill='#999' textAnchor='middle'>
            {value}
          </text>
        </Fragment>
      )
    })}
  </Svg>
))

Grid.displayName = 'Grid'

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export interface HistogramProps extends ComponentPropsWithRef<'div'> {
  source?: VideoSource
  gain?: number
  pixelRatio?: number
}

export const Histogram: FC<HistogramProps> = ({
  source,
  gain,
  pixelRatio = window.devicePixelRatio,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasTarget, setCanvasTarget] = useState<CanvasTarget>()

  // BUG: Disposed CanvasTarget still tries to resize the canvas and doubling
  // its size every time fast refresh occurs. This way prevents it.
  useEffect(() => {
    const canvas = canvasRef.current
    invariant(canvas != null)
    setCanvasTarget(canvasTarget => {
      if (canvasTarget == null) {
        return new CanvasTarget(canvas)
      }
      canvasTarget.domElement = canvas
      return canvasTarget
    })
  }, [])

  canvasTarget?.setPixelRatio(pixelRatio)

  // BUG: CanvasTarget throws error when resized.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = contentRef.current
    invariant(content != null)
    if (canvasTarget == null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      canvasTarget.setSize(width, height)
    })
    observer.observe(content)
    return () => {
      observer.disconnect()
    }
  }, [canvasTarget])

  useEffect(() => {
    return () => {
      canvasTarget?.dispose()
    }
  }, [canvasTarget])

  const vectorscope = useMemo(() => new HistogramMesh(), [])

  vectorscope.source = source?.histogramTransform ?? null
  if (gain != null) {
    vectorscope.gain.value = gain
  }

  useEffect(() => {
    return () => {
      vectorscope.dispose()
    }
  }, [vectorscope])

  useEffect(() => {
    if (canvasTarget == null) {
      return
    }

    let rendererState: RendererUtils.RendererState
    let stopped = false

    const callback = (): void => {
      if (stopped) {
        return
      }
      if (source?.renderer != null) {
        source.update()

        const renderer = source.renderer
        rendererState = resetRendererState(renderer, rendererState)

        const prevCanvasTarget = renderer.getCanvasTarget()
        renderer.setCanvasTarget(canvasTarget)
        void renderer.render(vectorscope, camera)
        renderer.setCanvasTarget(prevCanvasTarget)

        restoreRendererState(renderer, rendererState)
      }
      requestAnimationFrame(callback)
    }
    requestAnimationFrame(callback)

    return () => {
      stopped = true
    }
  }, [source, canvasTarget, vectorscope])

  return (
    <Root {...props}>
      <Content ref={contentRef}>
        <Grid />
        <Canvas ref={canvasRef} />
      </Content>
    </Root>
  )
}
