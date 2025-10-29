import { useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { CanvasTarget, type Renderer } from 'three/webgpu'

export type UseCanvasTarget = [
  CanvasTarget | null,
  (canvas: HTMLCanvasElement | null) => void
]

export function useCanvasTarget(
  container?: HTMLElement | null,
  getSize = (width: number, height: number) => [width, height] as const
): UseCanvasTarget {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const canvasTarget = useMemo(
    () => (canvas != null ? new CanvasTarget(canvas) : null),
    [canvas]
  )

  const renderer = useThree<Renderer>(({ gl }) => gl as any)

  const getSizeRef = useRef(getSize)
  getSizeRef.current = getSize

  const resize = useCallback(
    (width: number, height: number) => {
      if (canvasTarget == null) {
        return
      }
      // Canvas target must be resized when it is activated in the renderer.
      const prevTarget = renderer.getCanvasTarget()
      renderer.setCanvasTarget(canvasTarget)
      canvasTarget.setSize(...getSizeRef.current(width, height))
      renderer.setCanvasTarget(prevTarget)
    },
    [canvasTarget, renderer]
  )

  useLayoutEffect(() => {
    if (container == null) {
      return
    }

    const rect = container.getBoundingClientRect()
    resize(rect.width, rect.height)

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect
      resize(rect.width, rect.height)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [container, resize])

  useEffect(() => {
    return () => {
      canvasTarget?.dispose()
    }
  }, [canvasTarget])

  return [canvasTarget, setCanvas]
}
