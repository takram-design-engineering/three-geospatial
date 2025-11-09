import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

const Root = /*#__PURE__*/ styled.input`
  box-sizing: border-box;
  height: 24px;
  min-width: 36px;
  outline: solid 1px #333;
  border: none;
  border-radius: 4px;
  color: #ccc;
  background-color: #111;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;

  &:focus-visible {
    outline: solid 1px #666;
    border: solid 1px #666;
  }
`

export const TextInput: FC<ComponentPropsWithRef<typeof Root>> = props => (
  <Root type='text' {...props} />
)
