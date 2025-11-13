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
import { mergeRefs } from 'react-merge-refs'

import { clamp } from '@takram/three-geospatial'

import { IconButton, InputLabel, TextInput } from './elements'
import { Reset } from './icons'
import { styledProps } from './utils'

import * as styles from './Range.css'

function preventDefault(event: MouseEvent | ReactMouseEvent): void {
  event.preventDefault()
}

export interface RangeProps
  extends Omit<ComponentPropsWithRef<'input'>, 'onChange'> {
  name: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange?: (event: { target: HTMLInputElement; value: number }) => void
  onReset?: () => void
}

export const Range: FC<RangeProps> = ({
  name,
  value,
  min = 0,
  max = 1,
  step = 0.005,
  onChange,
  onReset,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const stateRef = useRef({ value, min, max, step })
  Object.assign(stateRef.current, { value, min, max, step })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    const input = inputRef.current
    if (input == null) {
      return
    }
    if (input === document.activeElement && event.target === input) {
      return // Already has focus on the text input.
    }
    event.preventDefault()

    let moved = false
    const { clientX: x0 } = event
    const { value, step, min, max } = stateRef.current

    const handleMouseMove = (event: MouseEvent): void => {
      const { clientX: x1 } = event
      if (x0 !== x1) {
        const v1 = clamp(value + (x1 - x0) * step, min, max)
        onChangeRef.current?.({ target: input, value: v1 })
        moved = true
      }
    }

    const handleMouseUp = (event: MouseEvent): void => {
      if (input === event.target && !moved) {
        input.focus()
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('contextmenu', preventDefault)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('contextmenu', preventDefault)
  }, [])

  const valueRef = useRef(value)
  valueRef.current = value

  const handle = useCallback((target: HTMLInputElement) => {
    const value = parseFloat(target.value)
    if (!isNaN(value)) {
      onChangeRef.current?.({ target, value })
    } else {
      target.value = valueRef.current.toFixed(3)
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handle(event.currentTarget)
      }
    },
    [handle]
  )

  const handleBlur = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handle(event.currentTarget)
    },
    [handle]
  )

  useLayoutEffect(() => {
    if (inputRef.current != null) {
      inputRef.current.value = value.toFixed(3)
    }
  }, [value])

  const id = useId()
  return (
    <span {...styledProps(styles.root, props)}>
      <span className={styles.body} onMouseDown={handleMouseDown}>
        <InputLabel
          className={styles.label}
          htmlFor={id}
          onClick={preventDefault} // Prevent it from focusing the input
        >
          {name}
        </InputLabel>
        <TextInput
          ref={mergeRefs([inputRef, props.ref])}
          id={id}
          name={name}
          className={styles.input}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </span>
      {onReset != null && (
        <IconButton className={styles.reset} onClick={onReset}>
          <Reset />
        </IconButton>
      )}
    </span>
  )
}
