import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

const Root = /*#__PURE__*/ styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  color: #ccc;
  background-color: black;
`

const Head = /*#__PURE__*/ styled.div`
  margin: 8px;
  margin-bottom: 0;
  color: #ccc;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.03em;
`

const Mode = /*#__PURE__*/ styled.span`
  color: #666;
  margin-left: 0.5em;
`

export interface VideoScopeProps extends ComponentPropsWithRef<typeof Root> {
  name: string
  mode?: string
}

export const VideoScope: FC<VideoScopeProps> = ({
  name,
  mode,
  children,
  ...props
}) => (
  <Root {...props}>
    <Head>
      {name}
      {mode != null && <Mode>{mode}</Mode>}
    </Head>
    {children}
  </Root>
)
