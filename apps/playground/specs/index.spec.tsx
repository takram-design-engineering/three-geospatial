import { render } from '@testing-library/react'

import Index from '../src/pages/index'

describe('Index', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Index />)
    expect(baseElement).toBeTruthy()
  })
})
