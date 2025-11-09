import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

const Root = styled.input`
  appearance: none;
  width: 100%;
  height: 12px;
  min-width: 120px;
  margin: 0;
  background: none;

  &:focus {
    outline: none;
  }

  &::-webkit-slider-runnable-track {
    height: 8px;
    margin: 0 -1px;
    border: solid 1px #333;
    border-radius: 4px;
    background-color: #111;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 12px;
    margin-top: -3px;
    border-radius: 4px;
    background-color: #999;
  }
`

export const RangeInput: FC<ComponentPropsWithRef<typeof Root>> = props => (
  <Root type='range' {...props} />
)
