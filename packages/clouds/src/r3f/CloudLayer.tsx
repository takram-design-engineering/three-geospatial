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

function applyProps(data: object, props: object): void {
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete data[key as keyof typeof data]
    }
  }
  Object.assign(data, props)
}

export type CloudLayerProps = CloudLayerData &
  ExpandNestedProps<CloudLayerData, 'densityProfile'>

export const CloudLayer = forwardRef<CloudLayerImpl, CloudLayerProps>(
  function CloudLayer(props, forwardedRef) {
    const { layers, indexPool } = useContext(CloudLayersContext)

    const ref = useRef<CloudLayerData>({})
    const indexRef = useRef<number>()
    const propsRef = useRef(props)
    propsRef.current = props

    useLayoutEffect(() => {
      // Sorting is just for predictability. Layer order is still not defined.
      const index = indexPool.sort((a, b) => a - b).shift()
      if (index == null) {
        return
      }
      indexRef.current = index
      layers[index] = ref.current

      applyProps(ref.current, propsRef.current)

      return () => {
        layers[index] = {}
        indexRef.current = undefined
        indexPool.push(index)
      }
    }, [layers, indexPool])

    // Surely this resets any modifications made via the ref.
    applyProps(ref.current, props)

    useImperativeHandle(forwardedRef, () => ref.current)
    return null
  }
)
