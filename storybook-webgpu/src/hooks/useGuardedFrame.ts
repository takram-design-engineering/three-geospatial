import { useFrame, type RenderCallback } from '@react-three/fiber'
import { useState } from 'react'

// Terminates when the callback throws an error, instead of executing it and
// throwing errors every frame.
export function useGuardedFrame(
  callback: RenderCallback,
  renderPriority?: number
): void {
  const [error, setError] = useState<unknown>()
  useFrame((state, delta, frame) => {
    if (error != null) {
      return
    }
    try {
      callback(state, delta, frame)
    } catch (error) {
      setError(error)
    }
  }, renderPriority)

  if (error != null) {
    throw error instanceof Error ? error : new Error('Unknown error')
  }
}
