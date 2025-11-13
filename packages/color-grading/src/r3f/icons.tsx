import type { ComponentPropsWithRef, FC } from 'react'

export const Reset: FC<ComponentPropsWithRef<'svg'>> = props => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    viewBox='0 0 640 640'
    width={16}
    height={16}
    fill='currentColor'
    {...props}
  >
    <path d='M112 64L112 166.1L139.1 139C239.1 39 401.2 39 501.1 139C551.1 189 576.1 254.5 576.1 320C576.1 461.4 461.5 576 320.1 576C217.7 576 129.4 515.9 88.5 429.2L131.9 408.7C165.2 479.3 237 528 320.1 528C435 528 528.1 434.9 528.1 320C528.1 266.7 507.8 213.5 467.2 172.9C386 91.7 254.3 91.7 173 172.9L145.9 200L248.1 200L248.1 248L64 248L64 64L112 64z' />
  </svg>
)
