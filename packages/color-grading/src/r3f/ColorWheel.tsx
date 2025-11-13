import {
  useCallback,
  useId,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type FC,
  type MouseEvent as ReactMouseEvent
} from 'react'

import { Rec709 } from '../Rec709'
import type { ColorTuple } from '../types'
import { IconButton, RangeInput, TextInput } from './elements'
import { Reset } from './icons'
import { styledProps } from './utils'

import * as styles from './ColorWheel.css'

function preventDefault(event: MouseEvent): void {
  event.preventDefault()
}

const rec709Scratch = /*#__PURE__*/ new Rec709()

const ColorControl: FC<{
  size: number
  color: ColorTuple
  onChange?: (color: ColorTuple) => void
}> = ({ size, color, onChange }) => {
  const [, cb, cr] = rec709Scratch.setSRGB(...color).toYCbCr()

  const stateRef = useRef({ cb, cr })
  Object.assign(stateRef.current, { cb, cr })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      const { clientX: x0, clientY: y0 } = event
      const { cb: cb0, cr: cr0 } = stateRef.current

      const sensitivity = 0.25

      const handleMouseMove = (event: MouseEvent): void => {
        const { clientX: x1, clientY: y1 } = event
        const cb1 = (x1 - x0) / size
        const cr1 = (y0 - y1) / size
        const cb = cb0 + cb1 * sensitivity
        const cr = cr0 + cr1 * sensitivity
        const color = rec709Scratch.setYCbCr(0, cb, cr).toColor()
        onChangeRef.current?.([color.r, color.g, color.b])
      }

      const handleMouseUp = (): void => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('contextmenu', preventDefault)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('contextmenu', preventDefault)
    },
    [size]
  )

  let x = cb
  let y = -cr
  const length = Math.hypot(x, y)
  if (length > 0.5) {
    x = (x / length) * 0.5
    y = (y / length) * 0.5
  }

  return (
    <div className={styles.wheel} style={{ width: size, height: size }}>
      <div className={styles.gradient} />
      <div className={styles.trackingArea} onMouseDown={handleMouseDown}>
        <svg className={styles.svg}>
          <line
            x1='0%'
            y1='50%'
            x2='100%'
            y2='50%'
            stroke='#fff'
            strokeOpacity={0.1}
          />
          <line
            x1='50%'
            y1='0%'
            x2='50%'
            y2='100%'
            stroke='#fff'
            strokeOpacity={0.1}
          />
          <circle
            cx={`${x * 100 + 50}%`}
            cy={`${y * 100 + 50}%`}
            r={5}
            fill='none'
            stroke='#fff'
          />
        </svg>
      </div>
    </div>
  )
}

export interface ColorWheelProps
  extends Omit<ComponentPropsWithRef<'div'>, 'color'> {
  name?: string
  size?: number
  color?: ColorTuple
  offset?: number
  onColorChange?: (color: ColorTuple) => void
  onOffsetChange?: (value: number) => void
  onReset?: () => void
}

export const ColorWheel: FC<ColorWheelProps> = ({
  name,
  size = 120,
  color = [0, 0, 0],
  offset = 0,
  onColorChange,
  onOffsetChange,
  onReset,
  ...props
}) => {
  const onOffsetChangeRef = useRef(onOffsetChange)
  onOffsetChangeRef.current = onOffsetChange

  const handleOffsetChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onOffsetChangeRef.current?.(+event.currentTarget.value)
    },
    []
  )

  const id = useId()
  return (
    <div {...styledProps(styles.root, props)}>
      <div className={styles.head}>
        {name != null && <div className={styles.name}>{name}</div>}
        <div className={styles.topRight}>
          <IconButton onClick={onReset}>
            <Reset />
          </IconButton>
        </div>
      </div>
      <ColorControl color={color} size={size} onChange={onColorChange} />
      <RangeInput
        min={-1}
        max={1}
        step={0.01}
        value={offset}
        onChange={handleOffsetChange}
      />
      <div className={styles.valueGrid}>
        <TextInput
          id={`${id}-y`}
          value={offset.toFixed(2)}
          onChange={handleOffsetChange}
        />
        <TextInput id={`${id}-r`} value={color[0].toFixed(2)} />
        <TextInput id={`${id}-g`} value={color[1].toFixed(2)} />
        <TextInput id={`${id}-b`} value={color[2].toFixed(2)} />
        <label className={styles.valueLabel} htmlFor={`${id}-y`}>
          Y
        </label>
        <label className={styles.valueLabel} htmlFor={`${id}-r`}>
          R
        </label>
        <label className={styles.valueLabel} htmlFor={`${id}-g`}>
          G
        </label>
        <label className={styles.valueLabel} htmlFor={`${id}-b`}>
          B
        </label>
      </div>
    </div>
  )
}
