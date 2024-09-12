import { type NextPage } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Playground = dynamic(
  async () => (await import('../components/Playground')).Playground,
  { ssr: false }
)

const Index: NextPage = () => {
  return (
    <Suspense>
      <Playground />
    </Suspense>
  )
}

export default Index
