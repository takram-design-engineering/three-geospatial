import { useAtomValue } from 'jotai'
import { useContext } from 'react'

import type { VideoSource } from '../VideoSource'
import { VideoContext } from './VideoContext'

export function useVideoSource(): VideoSource | null {
  const { sourceAtom } = useContext(VideoContext)
  return useAtomValue(sourceAtom)
}
