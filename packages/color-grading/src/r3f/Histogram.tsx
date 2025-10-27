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
import { OrthographicCamera } from 'three'
import { CanvasTarget, RendererUtils } from 'three/webgpu'

import { HistogramMesh } from '../HistogramMesh'
import type { VideoSource } from '../VideoSource'

const { resetRendererState, restoreRendererState } = RendererUtils

const Root = /*#__PURE__*/ styled.div`
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
  height: 100%;
  min-width: 200px;
  min-height: 200px;
  padding: 20px;
  padding-left: 30px;
  background-color: black;
  user-select: none;
`

const Content = /*#__PURE__*/ styled.div`
  position: relative;
  height: 100%;
`

const Canvas = /*#__PURE__*/ styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
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
    if (canvas == null) {
      return
    }
    setCanvasTarget(canvasTarget => {
      if (canvasTarget == null) {
        return new CanvasTarget(canvas)
      }
      canvasTarget.domElement = canvas
      return canvasTarget
    })
  }, [])

  canvasTarget?.setPixelRatio(pixelRatio)

  const contentRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<{ width?: number; height?: number }>({})
  useEffect(() => {
    const content = contentRef.current
    if (content == null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      sizeRef.current = entry.contentRect
    })
    observer.observe(content)
    return () => {
      observer.disconnect()
    }
  }, [])

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

        // Canvas target must be resize when it is activated in the renderer.
        const { width, height } = sizeRef.current
        if (width != null && height != null) {
          canvasTarget.setSize(width, height)
        }

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
