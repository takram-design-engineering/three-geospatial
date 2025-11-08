import { Splitter } from 'antd'
import {
  Children,
  cloneElement,
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type FC,
  type ReactElement
} from 'react'

interface PanelProps extends ComponentPropsWithRef<typeof Splitter.Panel> {}

export interface SplitProps extends ComponentPropsWithRef<typeof Splitter> {
  children?: Array<ReactElement<PanelProps>>
}

export const Split: FC<SplitProps> = ({ children, ...props }) => {
  const [sizes, setSizes] = useState<number[]>([])

  const onResizeRef = useRef(props.onResize)
  onResizeRef.current = props.onResize
  const handleResize = useCallback((sizes: number[]) => {
    setSizes(sizes)
    onResizeRef.current?.(sizes)
  }, [])

  return (
    <Splitter layout='vertical' {...props} onResize={handleResize}>
      {children != null &&
        Children.map(Array.from(children), (child, index) =>
          cloneElement(child, {
            size: sizes[index],
            ...(index > 0 && {
              min: 200,
              defaultSize: 250,
              collapsible: true
            })
          })
        )}
    </Splitter>
  )
}

export const SplitPanel = Splitter.Panel
