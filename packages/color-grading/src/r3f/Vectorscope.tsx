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
import { Color, OrthographicCamera } from 'three'
import type { Renderer } from 'three/webgpu'

import { radians } from '@takram/three-geospatial'

import type { RasterSource } from '../RasterSource'
import { normalizeYCbCr, Rec709, Rec709Format } from '../Rec709'
import { VectorscopeLine } from '../VectorscopeLine'
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
  padding: 10px;
  background-color: black;
  user-select: none;
`

const Content = /*#__PURE__*/ styled.div`
  overflow: hidden;
  position: relative;
  height: 100%;
  aspect-ratio: 1;
`

const strokeWidth = 6

const Canvas = /*#__PURE__*/ styled.canvas`
  position: absolute;
  top: ${strokeWidth / 2}px;
  left: ${strokeWidth / 2}px;
  width: ${`calc(100% - ${strokeWidth}px)`};
  height: ${`calc(100% - ${strokeWidth}px)`};
  image-rendering: pixelated;
  mix-blend-mode: screen;
`

const Svg = /*#__PURE__*/ styled.svg`
  position: absolute;
  top: ${strokeWidth / 2}px;
  left: ${strokeWidth / 2}px;
  width: ${`calc(100% - ${strokeWidth}px)`};
  height: ${`calc(100% - ${strokeWidth}px)`};
  font-size: 10px;
`

const chromaGradient = (): string => {
  const values = Array.from({ length: 16 }).map((_, index, { length }) => {
    const r = 2 * Math.PI * (0.25 - index / length)
    return new Color(
      ...Rec709.fromYCbCr(
        0.1,
        Math.cos(r) * 0.5,
        Math.sin(r) * 0.5
      ).toLinearSRGB()
    ).convertLinearToSRGB()
  })
  values.push(values[0])
  return values
    .map(({ r, g, b }) => `rgba(${r * 255} ${g * 255} ${b * 255} / 1)`)
    .join(',')
}

const Gradient = /*#__PURE__*/ styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: conic-gradient(${chromaGradient()});
  border-radius: 50%;
`

const colors = {
  YL: /*#__PURE__*/ normalizeYCbCr(877, 64, 553, Rec709Format.STUDIO_10BIT),
  CY: /*#__PURE__*/ normalizeYCbCr(754, 615, 64, Rec709Format.STUDIO_10BIT),
  G: /*#__PURE__*/ normalizeYCbCr(691, 167, 105, Rec709Format.STUDIO_10BIT),
  MG: /*#__PURE__*/ normalizeYCbCr(313, 857, 919, Rec709Format.STUDIO_10BIT),
  R: /*#__PURE__*/ normalizeYCbCr(250, 409, 960, Rec709Format.STUDIO_10BIT),
  B: /*#__PURE__*/ normalizeYCbCr(127, 960, 471, Rec709Format.STUDIO_10BIT)
}

const dPhi = 2.5 * (Math.PI / 180)
const dG = 0.025
const skinToneAngle = 123

const Grid = /*#__PURE__*/ memo(() => (
  <Svg>
    <circle cx='50%' cy='50%' r='50%' fill='black' stroke='none' />
    <circle cx='50%' cy='50%' r='37.5%' fill='none' stroke='#333' />
    <circle cx='50%' cy='50%' r='25%' fill='none' stroke='#333' />
    <circle cx='50%' cy='50%' r='12.5%' fill='none' stroke='#333' />
    <line x1='0%' y1='50%' x2='100%' y2='50%' stroke='#333' />
    <line x1='50%' y1='0%' x2='50%' y2='100%' stroke='#333' />
    {Object.entries(colors).map(([label, [y, cb, cr]]) => {
      const phi = Math.atan2(cr, cb)
      const cos1 = Math.cos(phi + dPhi)
      const sin1 = Math.sin(phi + dPhi)
      const cos2 = Math.cos(phi - dPhi)
      const sin2 = Math.sin(phi - dPhi)
      const g = Math.hypot(cb, cr)
      const g1 = g + dG
      const g2 = g - dG
      const points = [
        { x: `${50 + cos1 * g1 * 75}%`, y: `${50 - sin1 * g1 * 75}%` },
        { x: `${50 + cos1 * g2 * 75}%`, y: `${50 - sin1 * g2 * 75}%` },
        { x: `${50 + cos2 * g2 * 75}%`, y: `${50 - sin2 * g2 * 75}%` },
        { x: `${50 + cos2 * g1 * 75}%`, y: `${50 - sin2 * g1 * 75}%` }
      ]
      return (
        <Fragment key={label}>
          <line
            x1={points[0].x}
            y1={points[0].y}
            x2={points[1].x}
            y2={points[1].y}
            stroke='#666'
          />
          <line
            x1={points[1].x}
            y1={points[1].y}
            x2={points[2].x}
            y2={points[2].y}
            stroke='#666'
          />
          <line
            x1={points[2].x}
            y1={points[2].y}
            x2={points[3].x}
            y2={points[3].y}
            stroke='#666'
          />
          <line
            x1={points[3].x}
            y1={points[3].y}
            x2={points[0].x}
            y2={points[0].y}
            stroke='#666'
          />
          <text
            x={`${50 + Math.cos(phi) * g * 0.75 * 75}%`}
            y={`${50 - Math.sin(phi) * g * 0.75 * 75}%`}
            fill='#999'
            textAnchor='middle'
            dominantBaseline='middle'
          >
            {label}
          </text>
        </Fragment>
      )
    })}
    <line
      x1='50%'
      y1='50%'
      x2={`${50 + Math.cos(radians(skinToneAngle)) * 50}%`}
      y2={`${50 - Math.sin(radians(skinToneAngle)) * 50}%`}
      stroke='#666'
    />
  </Svg>
))

Grid.displayName = 'Grid'

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export interface VectorscopeProps extends ComponentPropsWithRef<'div'> {
  source?: RasterSource | null
  gain?: number
  scaled?: boolean
  pixelRatio?: number
}

export const Vectorscope = withTunnels<VectorscopeProps & WithTunnelsProps>(
  ({
    tunnels,
    source: sourceProp,
    gain = 5,
    scaled = true,
    pixelRatio = window.devicePixelRatio,
    ...props
  }) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [canvasTarget, setCanvas] = useCanvasTarget(
      contentRef.current,
      (width, height) => [width - strokeWidth, height - strokeWidth]
    )
    canvasTarget?.setPixelRatio(pixelRatio)

    const vectorscope = useMemo(() => new VectorscopeLine(), [])

    const source = useAtomValue(use(VideoContext).rasterAtom)
    vectorscope.source = source ?? sourceProp ?? null
    vectorscope.gain.value = gain
    vectorscope.scale.setScalar(scaled ? 1 : 0.75)

    useEffect(() => {
      return () => {
        vectorscope.dispose()
      }
    }, [vectorscope])

    useFrame(({ gl }) => {
      if (canvasTarget == null || sourceProp == null) {
        return
      }

      const renderer = gl as unknown as Renderer
      const prevTarget = renderer.getCanvasTarget()
      renderer.setCanvasTarget(canvasTarget)
      renderer.render(vectorscope, camera)
      renderer.setCanvasTarget(prevTarget)
    })

    return (
      <tunnels.HTML>
        <Root {...props}>
          <Content ref={contentRef}>
            <Gradient />
            <Grid />
            <Canvas ref={setCanvas} />
          </Content>
        </Root>
      </tunnels.HTML>
    )
  }
)
