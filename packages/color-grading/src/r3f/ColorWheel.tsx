import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type FC,
  type KeyboardEvent,
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

const Trackball: FC<{
  size: number
  color: ColorTuple
  onChange?: (event: { target: HTMLElement; value: ColorTuple }) => void
}> = ({ size, color, onChange }) => {
  const [, cb, cr] = rec709Scratch.setSRGB(...color).toYCbCr()

  const stateRef = useRef({ cb, cr })
  Object.assign(stateRef.current, { cb, cr })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleMouseDown = useCallback(
    (event0: ReactMouseEvent<HTMLElement>) => {
      const { clientX: x0, clientY: y0 } = event0
      const { cb: cb0, cr: cr0 } = stateRef.current

      const sensitivity = 0.25

      const handleMouseMove = (event1: MouseEvent): void => {
        const { clientX: x1, clientY: y1 } = event1
        const cb1 = (x1 - x0) / size
        const cr1 = (y0 - y1) / size
        const cb = cb0 + cb1 * sensitivity
        const cr = cr0 + cr1 * sensitivity
        const color = rec709Scratch.setYCbCr(0, cb, cr).toColor()
        onChangeRef.current?.({
          target: event0.currentTarget,
          value: [color.r, color.g, color.b]
        })
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
      <div className={styles.trackball} onMouseDown={handleMouseDown}>
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
  onColorChange?: (event: { target: HTMLElement; value: ColorTuple }) => void
  onOffsetChange?: (event: { target: HTMLInputElement; value: number }) => void
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
      onOffsetChangeRef.current?.({
        target: event.currentTarget,
        value: +event.currentTarget.value
      })
    },
    []
  )

  const colorRef = useRef(color)
  colorRef.current = color

  const onColorChangeRef = useRef(onColorChange)
  onColorChangeRef.current = onColorChange

  const handleColor = useCallback((target: HTMLInputElement) => {
    const index = { r: 0, g: 1, b: 2 }[target.name]
    if (index == null) {
      return
    }
    const value = parseFloat(target.value)
    if (!isNaN(value)) {
      const color: ColorTuple = [...colorRef.current]
      color[index] = value
      onColorChangeRef.current?.({
        target,
        value: color
      })
    } else {
      target.value = colorRef.current[index].toFixed(2)
    }
  }, [])

  const handleColorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleColor(event.currentTarget)
      }
    },
    [handleColor]
  )

  const handleColorBlur = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleColor(event.currentTarget)
    },
    [handleColor]
  )

  const refs = {
    r: useRef<HTMLInputElement>(null),
    g: useRef<HTMLInputElement>(null),
    b: useRef<HTMLInputElement>(null)
  }

  useLayoutEffect(() => {
    if (refs.r.current != null) {
      refs.r.current.value = color[0].toFixed(2)
    }
    if (refs.g.current != null) {
      refs.g.current.value = color[1].toFixed(2)
    }
    if (refs.b.current != null) {
      refs.b.current.value = color[2].toFixed(2)
    }
  }, [color, refs.r, refs.b, refs.g])

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
      <Trackball color={color} size={size} onChange={onColorChange} />
      <RangeInput
        min={-1}
        max={1}
        step={0.01}
        value={offset}
        onChange={handleOffsetChange}
      />
      <div className={styles.values}>
        <TextInput
          id={`${id}-y`}
          value={offset.toFixed(2)}
          onChange={handleOffsetChange}
        />
        {(['r', 'g', 'b'] as const).map(name => (
          <TextInput
            key={name}
            ref={refs[name]}
            id={`${id}-${name}`}
            name={name}
            onKeyDown={handleColorKeyDown}
            onBlur={handleColorBlur}
          />
        ))}
        <label className={styles.inputLabel} htmlFor={`${id}-y`}>
          Y
        </label>
        {['r', 'g', 'b'].map(name => (
          <label
            key={name}
            className={styles.inputLabel}
            htmlFor={`${id}-${name}`}
          >
            {name.toUpperCase()}
          </label>
        ))}
      </div>
    </div>
  )
}
