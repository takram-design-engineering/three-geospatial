import { useContext, useMemo, type ComponentType } from 'react'
import tunnel from 'tunnel-rat'

import { VideoContext } from './VideoContext'

type In = ReturnType<typeof tunnel>['In']

export interface WithTunnelsProps {
  tunnels: {
    HTML: In
    R3F: In
  }
}

export function withTunnels<P extends WithTunnelsProps>(
  Component: ComponentType<P>
): ComponentType<Omit<P, keyof WithTunnelsProps>> {
  const WithTunnels: ComponentType<Omit<P, keyof WithTunnelsProps>> = props => {
    const html = useMemo(() => tunnel(), [])
    const { r3f } = useContext(VideoContext)
    const tunnels = useMemo(
      () => ({
        HTML: html.In,
        R3F: r3f.In
      }),
      [html, r3f]
    )
    return (
      <>
        <r3f.In>
          <Component
            {...(props as any)} // TODO
            tunnels={tunnels}
          />
        </r3f.In>
        <html.Out />
      </>
    )
  }
  return WithTunnels
}
