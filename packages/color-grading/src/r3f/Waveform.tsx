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
import { OrthographicCamera, Scene } from 'three'
import { CanvasTarget, RendererUtils } from 'three/webgpu'

import type { VideoSource } from '../VideoSource'
import {
  WaveformLine,
  type WaveformMode as WaveformModeBase
} from '../WaveformLine'

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

const skinToneValue = 60

const Grid = /*#__PURE__*/ memo(() => (
  <Svg>
    <rect x={0} y={0} width='100%' height='100%' fill='black' stroke='#333' />
    {[0, 25, 50, 75, 100].map(value => {
      const y = 100 - value
      return (
        <Fragment key={value}>
          <line x1='0%' x2='100%' y1={`${y}%`} y2={`${y}%`} stroke='#333' />
          <text
            x={-5}
            y={`${y}%`}
            fill='#999'
            textAnchor='end'
            dominantBaseline='middle'
          >
            {value}
          </text>
        </Fragment>
      )
    })}
    <line
      x1='0%'
      x2='100%'
      y1={`${100 - skinToneValue}%`}
      y2={`${100 - skinToneValue}%`}
      stroke='#666'
    />
    <text
      x={-5}
      y={`${100 - skinToneValue}%`}
      fill='#ccc'
      textAnchor='end'
      dominantBaseline='middle'
    >
      {skinToneValue}
    </text>
  </Svg>
))

Grid.displayName = 'Grid'

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export type WaveformMode = WaveformModeBase | 'rgb-parade' | 'ycbcr-parade'

export interface WaveformProps extends ComponentPropsWithRef<'div'> {
  source?: VideoSource
  mode?: WaveformMode
  gain?: number
  pixelRatio?: number
}

export const Waveform: FC<WaveformProps> = ({
  source,
  mode,
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

  const parade = mode === 'rgb-parade' || mode === 'ycbcr-parade'
  const waveforms = useMemo(
    () => [new WaveformLine(), new WaveformLine(), new WaveformLine()],
    []
  )

  for (const waveform of waveforms) {
    waveform.source = source?.rasterTransform ?? null
    if (gain != null) {
      waveform.gain.value = gain
    }
  }
  if (mode === 'rgb-parade') {
    waveforms[0].mode = 'red'
    waveforms[1].mode = 'green'
    waveforms[2].mode = 'blue'
  } else if (mode === 'ycbcr-parade') {
    waveforms[0].mode = 'luma'
    waveforms[1].mode = 'cb'
    waveforms[2].mode = 'cr'
  } else if (mode != null) {
    waveforms[0].mode = mode
  }

  useEffect(() => {
    return () => {
      for (const waveform of waveforms) {
        waveform.dispose()
      }
    }
  }, [waveforms])

  const scene = useMemo(() => new Scene(), [])
  useEffect(() => {
    if (parade) {
      scene.add(...waveforms)
    } else {
      scene.add(waveforms[0])
    }
    return () => {
      scene.remove(...waveforms)
    }
  }, [parade, waveforms, scene])

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

        void renderer.render(scene, camera)
        renderer.setCanvasTarget(prevCanvasTarget)

        restoreRendererState(renderer, rendererState)
      }
      requestAnimationFrame(callback)
    }
    requestAnimationFrame(callback)

    return () => {
      stopped = true
    }
  }, [source, canvasTarget, scene])

  return (
    <Root {...props}>
      <Content ref={contentRef}>
        <Grid />
        <Canvas ref={canvasRef} />
      </Content>
    </Root>
  )
}
