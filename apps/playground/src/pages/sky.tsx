import { type NextPage } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Container = dynamic(
  async () => (await import('../containers/Sky')).Container,
  { ssr: false }
)

const Page: NextPage = () => {
  return (
    <Suspense>
      <Container />
    </Suspense>
  )
}

export default Page
