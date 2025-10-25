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
import { OrthographicCamera, Vector3 } from 'three'
import { CanvasTarget, RendererUtils } from 'three/webgpu'
import invariant from 'tiny-invariant'

import { radians, remap } from '@takram/three-geospatial'

import { VectorscopeLine } from '../VectorscopeLine'
import type { VideoSource } from '../VideoSource'

const { resetRendererState, restoreRendererState } = RendererUtils

const Root = /*#__PURE__*/ styled.div`
  position: relative;
  width: 360px;
  height: 360px;
  aspect-ratio: 1;
  user-select: none;
`

const Content = /*#__PURE__*/ styled.div`
  --insets: 15px;

  position: relative;
  width: calc(100% - var(--insets) * 2);
  height: calc(100% - var(--insets) * 2);
  margin: var(--insets);
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

function normalize(ycbcr: Vector3): Vector3 {
  return ycbcr.set(
    remap(ycbcr.x, 64, 940, 0, 1),
    remap(ycbcr.y, 64, 960, -0.5, 0.5),
    remap(ycbcr.z, 64, 960, -0.5, 0.5)
  )
}

const colors = {
  YL: /*#__PURE__*/ normalize(new Vector3(877, 64, 553)),
  CY: /*#__PURE__*/ normalize(new Vector3(754, 615, 64)),
  G: /*#__PURE__*/ normalize(new Vector3(691, 167, 105)),
  MG: /*#__PURE__*/ normalize(new Vector3(313, 857, 919)),
  R: /*#__PURE__*/ normalize(new Vector3(250, 409, 960)),
  B: /*#__PURE__*/ normalize(new Vector3(127, 960, 471))
}

const dPhi = 2.5 * (Math.PI / 180)
const dG = 0.025
const skinToneAngle = 123

const Grid = /*#__PURE__*/ memo(() => (
  <Svg>
    <circle cx='50%' cy='50%' r='50%' fill='black' stroke='#333' />
    <circle cx='50%' cy='50%' r='37.5%' fill='none' stroke='#333' />
    <circle cx='50%' cy='50%' r='25%' fill='none' stroke='#333' />
    <circle cx='50%' cy='50%' r='12.5%' fill='none' stroke='#333' />
    <line x1='0%' y1='50%' x2='100%' y2='50%' stroke='#333' />
    <line x1='50%' y1='0%' x2='50%' y2='100%' stroke='#333' />
    {Object.entries(colors).map(([label, color]) => {
      const phi = Math.atan2(color.z, color.y)
      const g = Math.hypot(color.y, color.z)
      const cos1 = Math.cos(phi + dPhi)
      const sin1 = Math.sin(phi + dPhi)
      const cos2 = Math.cos(phi - dPhi)
      const sin2 = Math.sin(phi - dPhi)
      const g1 = g + dG
      const g2 = g - dG
      return (
        <Fragment key={label}>
          <line
            x1={`${50 + cos1 * g1 * 75}%`}
            y1={`${50 - sin1 * g1 * 75}%`}
            x2={`${50 + cos1 * g2 * 75}%`}
            y2={`${50 - sin1 * g2 * 75}%`}
            stroke='#666'
          />
          <line
            x1={`${50 + cos1 * g2 * 75}%`}
            y1={`${50 - sin1 * g2 * 75}%`}
            x2={`${50 + cos2 * g2 * 75}%`}
            y2={`${50 - sin2 * g2 * 75}%`}
            stroke='#666'
          />
          <line
            x1={`${50 + cos2 * g2 * 75}%`}
            y1={`${50 - sin2 * g2 * 75}%`}
            x2={`${50 + cos2 * g1 * 75}%`}
            y2={`${50 - sin2 * g1 * 75}%`}
            stroke='#666'
          />
          <line
            x1={`${50 + cos2 * g1 * 75}%`}
            y1={`${50 - sin2 * g1 * 75}%`}
            x2={`${50 + cos1 * g1 * 75}%`}
            y2={`${50 - sin1 * g1 * 75}%`}
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
  source?: VideoSource
  gain?: number
  pixelRatio?: number
}

export const Vectorscope: FC<VectorscopeProps> = ({
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

  const contentRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<{ width?: number; height?: number }>({})
  useEffect(() => {
    const content = contentRef.current
    invariant(content != null)
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

  const vectorscope = useMemo(() => new VectorscopeLine(), [])

  vectorscope.scale.setScalar(0.75)
  vectorscope.source = source?.rasterTransform ?? null
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
