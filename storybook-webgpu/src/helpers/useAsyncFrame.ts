import { useFrame, type RenderCallback } from '@react-three/fiber'
import { useRef } from 'react'

export type AsyncRenderCallback = (
  ...args: Parameters<RenderCallback>
) => Promise<void>

export function useAsyncFrame(
  callback: AsyncRenderCallback,
  renderPriority?: number
): void {
  const readyRef = useRef(true)
  useFrame((state, delta, frame) => {
    if (!readyRef.current) {
      return
    }
    readyRef.current = false
    callback(state, delta, frame)
      .then(() => {
        readyRef.current = true
      })
      .catch((error: unknown) => {
        throw error
      })
  }, renderPriority)
}
