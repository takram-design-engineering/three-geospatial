import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

const Root = /*#__PURE__*/ styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  color: #ccc;
  background-color: black;
`

const Name = /*#__PURE__*/ styled.div`
  margin: 8px;
  margin-bottom: 0;
  color: #ccc;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.03em;
`

export interface VideoScopeProps extends ComponentPropsWithRef<typeof Root> {
  name: string
}

export const VideoScope: FC<VideoScopeProps> = ({
  name,
  children,
  ...props
}) => (
  <Root {...props}>
    <Name>{name}</Name>
    {children}
  </Root>
)
