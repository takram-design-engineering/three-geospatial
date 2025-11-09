import styled from '@emotion/styled'
import type { ComponentPropsWithRef } from 'react'

export const ColorWheels = styled.div`
  display: grid;
  grid-template-columns: repeat(3, min-content);
  grid-template-rows: 1fr;
  grid-column-gap: 16px;
  justify-content: space-evenly;
  padding: 8px 16px;
  background-color: #222;
`

export interface ColorWheelsProps
  extends ComponentPropsWithRef<typeof ColorWheels> {}
