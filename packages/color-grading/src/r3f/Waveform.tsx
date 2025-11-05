import styled from '@emotion/styled'
import { useFrame } from '@react-three/fiber'
import { useAtomValue } from 'jotai'
import {
  Fragment,
  memo,
  use,
  useEffect,
  useMemo,
  useRef,
  type ComponentPropsWithRef
} from 'react'
import { OrthographicCamera } from 'three'
import type { Renderer } from 'three/webgpu'

import type { RasterSource } from '../RasterSource'
import { WaveformLine, type WaveformMode } from '../WaveformLine'
import { useCanvasTarget } from './useCanvasTarget'
import { VideoContext } from './VideoContext'
import { withTunnels, type WithTunnelsProps } from './withTunnels'

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

export interface WaveformProps extends ComponentPropsWithRef<'div'> {
  source?: RasterSource | null
  mode?: WaveformMode
  gain?: number
  pixelRatio?: number
}

export const Waveform = withTunnels<WaveformProps & WithTunnelsProps>(
  ({
    tunnels,
    source: sourceProp,
    mode,
    gain,
    pixelRatio = window.devicePixelRatio,
    ...props
  }) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [canvasTarget, setCanvas] = useCanvasTarget(contentRef.current)
    canvasTarget?.setPixelRatio(pixelRatio)

    const waveform = useMemo(() => new WaveformLine(), [])

    const source = useAtomValue(use(VideoContext).rasterAtom)
    waveform.source = source ?? sourceProp ?? null
    if (gain != null) {
      waveform.gain.value = gain
    }
    if (mode != null) {
      waveform.mode = mode
    }

    useEffect(() => {
      return () => {
        waveform.dispose()
      }
    }, [waveform])

    useFrame(({ gl }) => {
      if (canvasTarget == null || sourceProp == null) {
        return
      }

      const renderer = gl as unknown as Renderer
      const prevTarget = renderer.getCanvasTarget()
      renderer.setCanvasTarget(canvasTarget)
      void renderer.render(waveform, camera)
      renderer.setCanvasTarget(prevTarget)
    })

    return (
      <tunnels.HTML>
        <Root {...props}>
          <Content ref={contentRef}>
            <Grid />
            <Canvas ref={setCanvas} />
          </Content>
        </Root>
      </tunnels.HTML>
    )
  }
)
