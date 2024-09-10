import styled from '@emotion/styled'
import { type NextPage } from 'next'
import dynamic from 'next/dynamic'

const Main = dynamic(async () => (await import('../components/Main')).Main, {
  ssr: false
})

const Root = styled.div`
  width: 100%;
  height: 100%;
`

const Index: NextPage = () => {
  return (
    <Root>
      <Main />
    </Root>
  )
}

export default Index
