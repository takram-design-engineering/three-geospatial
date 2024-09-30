import { type NextPage } from 'next'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Photorealistic = dynamic(
  async () => (await import('../Photorealistic')).Container,
  { ssr: false }
)

const Page: NextPage = () => {
  return (
    <Suspense>
      <Photorealistic />
    </Suspense>
  )
}

export default Page
