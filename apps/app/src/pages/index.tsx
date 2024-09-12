import { type NextPage } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Main = dynamic(async () => (await import('../components/Main')).Main, {
  ssr: false
})

const Index: NextPage = () => {
  return (
    <Suspense>
      <Main />
    </Suspense>
  )
}

export default Index
