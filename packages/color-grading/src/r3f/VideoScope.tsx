import type { ComponentPropsWithRef, FC } from 'react'

import * as styles from './VideoScope.css'

export interface VideoScopeProps extends ComponentPropsWithRef<'div'> {
  name: string
  mode?: string
}

export const VideoScope: FC<VideoScopeProps> = ({
  name,
  mode,
  children,
  ...props
}) => (
  <div className={styles.root} {...props}>
    <div className={styles.head}>
      {name}
      {mode != null && <span className={styles.mode}>{mode}</span>}
    </div>
    {children}
  </div>
)
