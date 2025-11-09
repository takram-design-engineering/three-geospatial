import { useCallback, useRef, useState, type ChangeEvent } from 'react'

import type { ColorBalanceNode } from '../ColorBalanceNode'
import type { RangeState } from './useRangeState'

export interface ColorBalanceState {
  temperature: RangeState
  tint: RangeState
}

export function useColorBalanceState(
  node: ColorBalanceNode,
  initialTemperature = 0,
  initialTint = 0
): ColorBalanceState {
  const [temperature, setTemperature] = useState(initialTemperature)
  const [tint, setTint] = useState(initialTint)

  const temperatureRef = useRef(temperature)
  temperatureRef.current = temperature
  const tintRef = useRef(tint)
  tintRef.current = tint

  const handleTemperatureChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = +event.target.value
      node.setParams(value, tintRef.current)
      setTemperature(value)
    },
    [node]
  )

  const handleTintChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = +event.target.value
      node.setParams(temperatureRef.current, value)
      setTint(value)
    },
    [node]
  )

  const initialTemperatureRef = useRef(initialTemperature)
  initialTemperatureRef.current = initialTemperature
  const initialTintRef = useRef(initialTint)
  initialTintRef.current = initialTint

  const handleTemperatureReset = useCallback(() => {
    node.setParams(initialTemperatureRef.current, tintRef.current)
    setTemperature(initialTemperatureRef.current)
  }, [node])

  const handleTintReset = useCallback(() => {
    node.setParams(temperatureRef.current, initialTintRef.current)
    setTint(initialTintRef.current)
  }, [node])

  return {
    temperature: {
      value: temperature,
      onChange: handleTemperatureChange,
      onReset: handleTemperatureReset
    },
    tint: {
      value: tint,
      onChange: handleTintChange,
      onReset: handleTintReset
    }
  }
}
