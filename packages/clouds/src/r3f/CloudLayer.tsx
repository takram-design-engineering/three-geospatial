import {
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type FC,
  type Ref
} from 'react'

import type { ExpandNestedProps } from '@takram/three-geospatial/r3f'

import {
  CloudLayer as CloudLayerImpl,
  type CloudLayerLike
} from '../CloudLayer'
import { CloudLayers } from '../CloudLayers'
import { CloudLayersContext } from './CloudLayers'

export interface CloudLayerProps
  extends CloudLayerLike,
    ExpandNestedProps<CloudLayerLike, 'densityProfile'> {
  ref?: Ref<CloudLayerImpl>
  index?: number
}

export const CloudLayer: FC<CloudLayerProps> = ({
  ref: forwardedRef,
  index: indexProp,
  ...props
}) => {
  const context = useContext(CloudLayersContext)
  if (context == null) {
    throw new Error('CloudLayer can only be used within the Clouds component!')
  }

  const { layers, indexPool, disableDefault } = context
  const [index, setIndex] = useState<number>()

  useLayoutEffect(() => {
    if (indexProp != null) {
      const poolIndex = indexPool.indexOf(indexProp)
      if (poolIndex !== -1) {
        indexPool.splice(poolIndex, 1)
        setIndex(indexProp)
        return () => {
          indexPool.push(indexProp)
          setIndex(undefined)
        }
      }
    } else {
      // Sorting is just for predictability. Layer order is still not defined,
      // but it doesn't matter.
      const index = indexPool.sort((a, b) => a - b).shift()
      if (index != null) {
        setIndex(index)
        return () => {
          indexPool.push(index)
          setIndex(undefined)
        }
      }
    }
  }, [indexProp, layers, indexPool])

  useLayoutEffect(() => {
    if (index == null) {
      return
    }
    const layer = layers[index]
    return () => {
      layer.copy(
        disableDefault ? CloudLayerImpl.DEFAULT : CloudLayers.DEFAULT[index]
      )
    }
  }, [layers, index, disableDefault])

  useEffect(() => {
    if (index == null) {
      return
    }
    if (typeof forwardedRef === 'function') {
      forwardedRef(layers[index])
    } else if (forwardedRef != null) {
      forwardedRef.current = layers[index]
    }
  }, [forwardedRef, layers, index])

  // Surely this resets any modifications made via forwarded ref.
  if (index != null) {
    const layer = layers[index]
    layer.copy(
      disableDefault ? CloudLayerImpl.DEFAULT : CloudLayers.DEFAULT[index]
    )
    layer.set(props)
  }

  return null
}
