import { useFrame, type RenderCallback } from '@react-three/fiber'
import { useRef } from 'react'

// Terminates when the callback throws an error, instead of executing it and
// throwing errors every frame.
export function useGuardedFrame(
  callback: RenderCallback,
  renderPriority?: number
): void {
  const errorRef = useRef<unknown>(undefined)
  useFrame((state, delta, frame) => {
    if (errorRef.current != null) {
      return
    }
    try {
      callback(state, delta, frame)
    } catch (error) {
      errorRef.current = error
      throw error
    }
  }, renderPriority)
}
