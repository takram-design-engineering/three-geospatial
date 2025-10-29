import styled from '@emotion/styled'
import { useFrame } from '@react-three/fiber'
import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  type ComponentPropsWithRef,
  type FC
} from 'react'
import { OrthographicCamera } from 'three'
import type { Renderer } from 'three/webgpu'

import { HistogramMesh } from '../HistogramMesh'
import type { VideoSource } from '../VideoSource'
import { useCanvasTarget } from './useCanvasTarget'
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
  source?: VideoSource | null
  gain?: number
  pixelRatio?: number
}

export const HistogramImpl: FC<HistogramProps & WithTunnelsProps> = ({
  tunnels,
  source,
  gain,
  pixelRatio = window.devicePixelRatio,
  ...props
}) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const [canvasTarget, setCanvas] = useCanvasTarget(contentRef.current)
  canvasTarget?.setPixelRatio(pixelRatio)

  const histogram = useMemo(() => new HistogramMesh(), [])

  histogram.source = source?.histogramTransform ?? null
  if (gain != null) {
    histogram.gain.value = gain
  }

  useEffect(() => {
    return () => {
      histogram.dispose()
    }
  }, [histogram])

  useFrame(({ gl }) => {
    if (canvasTarget == null || source == null) {
      return
    }

    source.update()

    const renderer = gl as unknown as Renderer
    const prevTarget = renderer.getCanvasTarget()
    renderer.setCanvasTarget(canvasTarget)
    void renderer.render(histogram, camera)
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

export const Histogram = withTunnels(HistogramImpl)
