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

import { HistogramMesh } from '../HistogramMesh'
import type { HistogramSource } from '../HistogramSource'
import { useCanvasTarget } from './useCanvasTarget'
import { VideoContext } from './VideoContext'
import { VideoScope } from './VideoScope'
import { withTunnels, type WithTunnelsProps } from './withTunnels'

const Root = /*#__PURE__*/ styled.div`
  display: grid;
  padding: 16px;
  padding-top: 24px;
  user-select: none;
`

const Content = /*#__PURE__*/ styled.div`
  position: relative;
  min-width: 200px;
  min-height: 100px;
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
  font-variant-numeric: tabular-nums;
`

const Grid = /*#__PURE__*/ memo(() => (
  <Svg>
    <rect x={0} y={0} width='100%' height='100%' fill='black' stroke='#333' />
    {[0, 25, 50, 75, 100].map((value, index, { length }) => {
      const x = value
      return (
        <Fragment key={value}>
          <line x1={`${x}%`} x2={`${x}%`} y1='0%' y2='100%' stroke='#333' />
          <text
            x={`${x}%`}
            y={-5}
            fill='#999'
            textAnchor={index < length - 1 ? 'middle' : 'end'}
          >
            {value}
          </text>
        </Fragment>
      )
    })}
  </Svg>
))

Grid.displayName = 'Grid'

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export interface HistogramProps
  extends Omit<ComponentPropsWithRef<typeof Root>, 'children'> {
  source?: HistogramSource | null
  gain?: number
  pixelRatio?: number
}

export const Histogram = withTunnels<HistogramProps & WithTunnelsProps>(
  ({
    tunnels,
    source: sourceProp,
    gain = 5,
    pixelRatio = window.devicePixelRatio,
    ...props
  }) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [canvasTarget, setCanvas] = useCanvasTarget(contentRef.current)
    canvasTarget?.setPixelRatio(pixelRatio)

    const histogram = useMemo(() => new HistogramMesh(), [])

    const source = useAtomValue(use(VideoContext).histogramAtom)
    histogram.source = source ?? sourceProp ?? null
    histogram.gain.value = gain

    useEffect(() => {
      return () => {
        histogram.dispose()
      }
    }, [histogram])

    useFrame(({ gl }) => {
      if (canvasTarget == null || sourceProp == null) {
        return
      }

      const renderer = gl as unknown as Renderer
      const prevTarget = renderer.getCanvasTarget()
      renderer.setCanvasTarget(canvasTarget)
      renderer.render(histogram, camera)
      renderer.setCanvasTarget(prevTarget)
    })

    return (
      <tunnels.HTML>
        <VideoScope name='Histogram'>
          <Root {...props}>
            <Content ref={contentRef}>
              <Grid />
              <Canvas ref={setCanvas} />
            </Content>
          </Root>
        </VideoScope>
      </tunnels.HTML>
    )
  }
)
