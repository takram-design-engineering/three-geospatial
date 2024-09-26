import { type NextPage } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Playground = dynamic(
  async () => (await import('../Playground')).Container,
  { ssr: false }
)

const Page: NextPage = () => {
  return (
    <Suspense>
      <Playground />
    </Suspense>
  )
}

export default Page
