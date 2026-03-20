import {
  TilesRenderer,
  TilesRendererContext,
  type TilesRendererProps
} from '3d-tiles-renderer/r3f'
import {
  useCallback,
  useContext,
  type ComponentRef,
  type FC,
  type RefAttributes
} from 'react'
import { mergeRefs } from 'react-merge-refs'

export interface SharedTilesRendererProps
  extends
    TilesRendererProps,
    RefAttributes<ComponentRef<typeof TilesRenderer>> {}

export const SharedTilesRenderer: FC<SharedTilesRendererProps> = ({
  ref: forwardedRef,
  ...props
}) => {
  const parent = useContext(TilesRendererContext)

  const ref = useCallback(
    (child: ComponentRef<typeof TilesRenderer> | null) => {
      if (child == null || parent == null) {
        return
      }
      const { lruCache, downloadQueue, parseQueue, processNodeQueue } = child

      // Share the cache and queues from the parent.
      child.lruCache = parent.lruCache
      child.downloadQueue = parent.downloadQueue
      child.parseQueue = parent.parseQueue
      child.processNodeQueue = parent.processNodeQueue

      return () => {
        child.lruCache = lruCache
        child.downloadQueue = downloadQueue
        child.parseQueue = parseQueue
        child.processNodeQueue = processNodeQueue
      }
    },
    [parent]
  )

  return <TilesRenderer {...props} ref={mergeRefs([ref, forwardedRef])} />
}
