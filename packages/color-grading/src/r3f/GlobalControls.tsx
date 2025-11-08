import styled from '@emotion/styled'
import { useAtomValue } from 'jotai'
import {
  use,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type FC
} from 'react'

import type { ColorBalanceNode } from '../ColorBalanceNode'
import type { ColorGradingNode } from '../ColorGradingNode'
import { NumericRange } from './NumericRange'
import { useSliderProps } from './useSliderProps'
import { VideoContext } from './VideoContext'

const Root = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: auto 40px 1fr auto;
  align-items: center;
  align-content: start;
  column-gap: 8px;
  row-gap: 16px;
  padding: 8px 16px;
  background-color: #222;
`

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function useColorBalanceProps(
  node: ColorBalanceNode,
  initialTemperature = 0,
  initialTint = 0
) {
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

const Content: FC<{ node: ColorGradingNode }> = ({ node }) => {
  const colorBalanceProps = useColorBalanceProps(node.colorBalanceNode)
  const contrastProps = useSliderProps(node, 'contrast', 1)
  const saturationProps = useSliderProps(node, 'saturation', 1)
  const vibranceProps = useSliderProps(node, 'vibrance', 1)

  return (
    <>
      <NumericRange
        name='Temperature'
        min={-1}
        max={1}
        {...colorBalanceProps.temperature}
      />
      <NumericRange name='Tint' min={-1} max={1} {...colorBalanceProps.tint} />
      <NumericRange name='Contrast' min={0} max={2} {...contrastProps} />
      <NumericRange name='Saturation' min={0} max={2} {...saturationProps} />
      <NumericRange name='Vibrance' min={0} max={2} {...vibranceProps} />
    </>
  )
}

export interface GlobalControlsProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node?: ColorGradingNode | null
}

export const GlobalControls: FC<GlobalControlsProps> = ({ node, ...props }) => {
  const { colorGradingNodeAtom } = use(VideoContext)
  const colorGradingNode = useAtomValue(colorGradingNodeAtom) ?? node
  return (
    <Root {...props}>
      {colorGradingNode != null && <Content node={colorGradingNode} />}
    </Root>
  )
}
