import styled from '@emotion/styled'
import { useProgress } from '@react-three/drei'
import { Progress as ProgressComponent } from 'antd'
import { AnimatePresence, motion } from 'motion/react'
import type { FC } from 'react'

const ProgressContainer = styled(motion.div)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
`

export const Progress: FC = () => {
  const progress = useProgress()
  return (
    <AnimatePresence>
      {progress.active && (
        <ProgressContainer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ProgressComponent
            type='circle'
            size='small'
            showInfo={false}
            percent={progress.progress}
            strokeColor='color-mix(in srgb, currentColor 66%, transparent)'
            trailColor='color-mix(in srgb, currentColor 33%, transparent)'
            style={{ color: 'inherit' }}
          />
        </ProgressContainer>
      )}
    </AnimatePresence>
  )
}
