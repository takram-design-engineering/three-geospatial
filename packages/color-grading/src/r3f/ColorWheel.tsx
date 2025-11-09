import styled from '@emotion/styled'
import {
  useCallback,
  useId,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type FC,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { Color } from 'three'

import { Rec709 } from '../Rec709'
import type { ColorTuple } from '../types'
import { Reset } from './icons'
import { IconButton, InputLabel, RangeInput, TextInput } from './ui'
import { chromaGradient } from './utils'

function preventDefault(event: MouseEvent): void {
  event.preventDefault()
}

const Root = /*#__PURE__*/ styled.div`
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto;
  row-gap: 8px;
  align-self: center;
  justify-items: center;
`

const Head = /*#__PURE__*/ styled.div`
  display: grid;
  grid-template-columns: 16px auto 16px;
  grid-template-areas: 'top-left name top-right';
  justify-items: center;
  width: 100%;
  height: 16px;
`

const Name = /*#__PURE__*/ styled(InputLabel)`
  grid-area: name;
`

const TopRight = /*#__PURE__*/ styled.div`
  grid-area: top-right;
`

const Wheel = /*#__PURE__*/ styled.div`
  position: relative;
  user-select: none;
  margin: 8px;
`

const Gradient = /*#__PURE__*/ styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  background: conic-gradient(${chromaGradient()});
  border-radius: 50%;
`

const strokeWidth = 6

const TrackingArea = /*#__PURE__*/ styled.div`
  position: absolute;
  top: ${strokeWidth / 2}px;
  left: ${strokeWidth / 2}px;
  width: calc(100% - ${strokeWidth}px);
  height: calc(100% - ${strokeWidth}px);
  background: radial-gradient(
    #333 0%,
    color-mix(in srgb, #111 75%, transparent) 100%
  );
  border-radius: 50%;
`

const Svg = /*#__PURE__*/ styled.svg`
  overflow: visible;
  position: absolute;
  width: 100%;
  height: 100%;
`

const ValueGrid = /*#__PURE__*/ styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  column-gap: 4px;
  row-gap: 2px;
`

const ValueLabel = /*#__PURE__*/ styled(InputLabel)`
  color: #999;
  font-size: 10px;
  text-align: center;
`

const ColorControl: FC<{
  size: number
  color: ColorTuple
  onChange?: (color: ColorTuple) => void
}> = ({ size, color, onChange }) => {
  const { y: cb, z: cr } = Rec709.fromColor(new Color(...color)).toYCbCr()

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
        const color = Rec709.fromYCbCr(0, cb, cr).toColor()
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
    <Wheel style={{ width: size, height: size }}>
      <Gradient />
      <TrackingArea onMouseDown={handleMouseDown}>
        <Svg>
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
        </Svg>
      </TrackingArea>
    </Wheel>
  )
}

export interface ColorWheelProps
  extends Omit<ComponentPropsWithRef<typeof Root>, 'color'> {
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
    <Root {...props}>
      <Head>
        {name != null && <Name>{name}</Name>}
        <TopRight>
          <IconButton onClick={onReset}>
            <Reset />
          </IconButton>
        </TopRight>
      </Head>
      <ColorControl color={color} size={size} onChange={onColorChange} />
      <RangeInput
        min={-1}
        max={1}
        step={0.01}
        value={offset}
        onChange={handleOffsetChange}
      />
      <ValueGrid>
        <TextInput
          id={`${id}-y`}
          value={offset.toFixed(2)}
          onChange={handleOffsetChange}
        />
        <TextInput id={`${id}-r`} value={color[0].toFixed(2)} />
        <TextInput id={`${id}-g`} value={color[1].toFixed(2)} />
        <TextInput id={`${id}-b`} value={color[2].toFixed(2)} />
        <ValueLabel htmlFor={`${id}-y`}>Y</ValueLabel>
        <ValueLabel htmlFor={`${id}-r`}>R</ValueLabel>
        <ValueLabel htmlFor={`${id}-g`}>G</ValueLabel>
        <ValueLabel htmlFor={`${id}-b`}>B</ValueLabel>
      </ValueGrid>
    </Root>
  )
}
