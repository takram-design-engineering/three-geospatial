import styled from '@emotion/styled'
import type { ComponentPropsWithRef } from 'react'

export const ColorWheels = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr;
  grid-column-gap: 32px;
  padding: 8px 16px;
  background-color: #222;
`

export interface ColorWheelsProps
  extends ComponentPropsWithRef<typeof ColorWheels> {}
