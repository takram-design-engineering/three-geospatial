import {
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react'

import { type ExpandNestedProps } from '@takram/three-geospatial/r3f'

import { type CloudLayer as CloudLayerData } from '../cloudLayer'
import { CloudLayersContext } from './CloudLayers'

export type CloudLayerImpl = CloudLayerData

function applyProps(target: object, source: object): void {
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete target[key as keyof typeof target]
    }
  }
  Object.assign(target, source)
}

export type CloudLayerProps = CloudLayerData &
  ExpandNestedProps<CloudLayerData, 'densityProfile'>

export const CloudLayer = forwardRef<CloudLayerImpl, CloudLayerProps>(
  function CloudLayer(props, forwardedRef) {
    const { layers, indexPool } = useContext(CloudLayersContext)

    const ref = useRef<CloudLayerData>({})
    const propsRef = useRef(props)
    propsRef.current = props

    useLayoutEffect(() => {
      // Sorting is just for predictability. Layer order is still not defined,
      // but it doesn't matter.
      const index = indexPool.sort((a, b) => a - b).shift()
      if (index == null) {
        return
      }
      layers[index] = ref.current
      applyProps(ref.current, propsRef.current)

      return () => {
        layers[index] = {}
        indexPool.push(index)
      }
    }, [layers, indexPool])

    // Surely this resets any modifications made via the forwarded ref.
    applyProps(ref.current, props)

    useImperativeHandle(forwardedRef, () => ref.current)
    return null
  }
)
