import styled from '@emotion/styled'
import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC
} from 'react'
import {
  CanvasTarget,
  OrthographicCamera,
  RendererUtils,
  Scene
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import type { VideoSource } from '../helpers/VideoSource'
import {
  VideoWaveform as VideoWaveformImpl,
  type VideoWaveformMode as VideoWaveformModeBase
} from '../helpers/VideoWaveform'

const { resetRendererState, restoreRendererState } = RendererUtils

const scale = 1.1

const Root = /*#__PURE__*/ styled.div`
  width: 480px;
  height: 360px;
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
  height: ${scale * 100}%;
  image-rendering: pixelated;
  mix-blend-mode: screen;
  transform: translate(0, calc(${(scale - 1) * -50}% * 1 / ${scale}));
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
      const y = 100 - value
      return (
        <Fragment key={value}>
          <line y1={`${y}%`} y2={`${y}%`} x1='0%' x2='100%' stroke='#333' />
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
  </Svg>
))

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export type VideoWaveformMode =
  | VideoWaveformModeBase
  | 'rgb-parade'
  | 'ycbcr-parade'

export interface VideoWaveformProps {
  source?: VideoSource
  mode?: VideoWaveformMode
  gain?: number
  pixelRatio?: number
}

export const VideoWaveform: FC<VideoWaveformProps> = ({
  source,
  mode,
  gain,
  pixelRatio = window.devicePixelRatio
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

  useEffect(() => {
    if (canvasTarget == null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      canvasTarget.setSize(width, height)
    })
    observer.observe(canvasTarget.domElement)
    return () => {
      observer.disconnect()
    }
  }, [canvasTarget])

  useEffect(() => {
    return () => {
      canvasTarget?.dispose()
    }
  }, [canvasTarget])

  const parade = mode === 'rgb-parade' || mode === 'ycbcr-parade'
  const waveforms = useMemo(
    () => [
      new VideoWaveformImpl(),
      new VideoWaveformImpl(),
      new VideoWaveformImpl()
    ],
    []
  )

  for (const waveform of waveforms) {
    waveform.scale.y = 1 / scale
    waveform.source = source?.analysis ?? null
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
    <Root>
      <Content>
        <Grid />
        <Canvas ref={canvasRef} />
      </Content>
    </Root>
  )
}
