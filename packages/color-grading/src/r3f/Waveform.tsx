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
import { WaveformLine, WaveformMode } from '../WaveformLine'
import { useCanvasTarget } from './useCanvasTarget'
import { VideoContext } from './VideoContext'
import { VideoScope } from './VideoScope'
import { withTunnels, type WithTunnelsProps } from './withTunnels'

import * as styles from './Waveform.css'

const skinToneValue = 60

const Grid = /*#__PURE__*/ memo(() => (
  <svg className={styles.svg}>
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
  </svg>
))

Grid.displayName = 'Grid'

const modeNames: Record<WaveformMode, string> = {
  [WaveformMode.LUMA]: 'Luma',
  [WaveformMode.CB]: 'Cb',
  [WaveformMode.CR]: 'Cr',
  [WaveformMode.RED]: 'Red',
  [WaveformMode.GREEN]: 'Green',
  [WaveformMode.BLUE]: 'Blue',
  [WaveformMode.RGB]: 'RGB',
  [WaveformMode.RGB_PARADE]: 'RGB Parade',
  [WaveformMode.YCBCR_PARADE]: 'YCbCr Parade'
}

const camera = /*#__PURE__*/ new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

export interface WaveformProps
  extends Omit<Partial<ComponentPropsWithRef<typeof VideoScope>>, 'children'> {
  source?: RasterSource | null
  mode?: WaveformMode | `${WaveformMode}`
  gain?: number
  pixelRatio?: number
}

export const Waveform = withTunnels<WaveformProps & WithTunnelsProps>(
  ({
    tunnels,
    source: sourceProp,
    mode = WaveformMode.LUMA,
    gain = 5,
    pixelRatio = window.devicePixelRatio,
    ...props
  }) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [canvasTarget, setCanvas] = useCanvasTarget(contentRef.current)
    canvasTarget?.setPixelRatio(pixelRatio)

    const waveform = useMemo(() => new WaveformLine(), [])

    const source = useAtomValue(use(VideoContext).rasterAtom)
    waveform.source = source ?? sourceProp ?? null
    waveform.mode = mode as WaveformMode
    waveform.gain.value = gain

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
      renderer.render(waveform, camera)
      renderer.setCanvasTarget(prevTarget)
    })

    return (
      <tunnels.HTML>
        <VideoScope {...props} name='Waveform' mode={modeNames[mode]}>
          <div className={styles.root}>
            <div className={styles.content} ref={contentRef}>
              <Grid />
              <canvas className={styles.canvas} ref={setCanvas} />
            </div>
          </div>
        </VideoScope>
      </tunnels.HTML>
    )
  }
)
