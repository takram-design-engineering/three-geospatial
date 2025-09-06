import styled from '@emotion/styled'
import { useProgress } from '@react-three/drei'
import { Progress as ProgressComponent } from 'antd'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, type FC } from 'react'

const ProgressContainer = styled(motion.div)`
  position: absolute;
  bottom: 0px;
  left: 0px;
  width: 100%;
`

const thickness = 3

export const Progress: FC = () => {
  const progress = useProgress()
  const percentRef = useRef(0)
  const percent = (percentRef.current = Math.max(
    percentRef.current,
    progress.progress
  ))
  return (
    <AnimatePresence>
      {progress.active && (
        <ProgressContainer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 1 } }}
        >
          <ProgressComponent
            type='line'
            size={{ height: thickness }}
            strokeColor='color-mix(in srgb, currentColor 66%, transparent)'
            trailColor='color-mix(in srgb, currentColor 33%, transparent)'
            strokeLinecap='butt'
            style={{
              display: 'block',
              color: 'currentColor',
              fontSize: `${thickness}px`,
              lineHeight: `${thickness}px`
            }}
            showInfo={false}
            percent={percent}
          />
        </ProgressContainer>
      )}
    </AnimatePresence>
  )
}
