import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

const Root = styled.input`
  appearance: none;
  width: 100%;
  height: 12px;
  min-width: 120px;
  margin: 0;
  background: none;

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
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
  }

  &:hover,
  &:focus-visible {
    outline: none;

    &::-webkit-slider-thumb {
      background-color: #ccc;
    }
  }
`

export const RangeInput: FC<ComponentPropsWithRef<typeof Root>> = props => (
  <Root type='range' {...props} />
)
