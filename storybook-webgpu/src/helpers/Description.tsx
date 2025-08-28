import styled from '@emotion/styled'
import { useThree } from '@react-three/fiber'
import type { TilesRenderer } from '3d-tiles-renderer'
import { atom, getDefaultStore, useAtomValue } from 'jotai'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type Ref
} from 'react'
import { createRoot, type Root } from 'react-dom/client'

const DescriptionElement = styled('div')`
  --gutter: 16px;
  --max-width: 600px;

  position: absolute;
  bottom: var(--gutter);
  left: var(--gutter);
  max-width: var(--max-width);
  color: rgba(255, 255, 255, calc(2 / 3));
  font-size: small;
  letter-spacing: 0.02em;
  pointer-events: none;
  user-select: none;

  @media (max-width: var(--max-width)) {
    max-width: 100%;
  }

  a,
  em {
    color: white;
    font-family: inherit;
    font-style: normal;
    text-decoration: none;
  }

  p {
    margin: 0;
    margin-bottom: calc(var(--gutter) / 2);
  }

  p:last-of-type {
    margin-bottom: var(--gutter);
  }
`

export const Attribution = styled('div')`
  overflow: visible;
  width: 0;
  font-size: x-small;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const tilesAtom = atom<TilesRenderer | null>(null)

export const connectToDescription: Ref<TilesRenderer | null> = tiles => {
  const store = getDefaultStore()
  store.set(tilesAtom, tiles ?? null)
  return () => {
    store.set(tilesAtom, null)
  }
}

const TilesAttribution: FC<{ tiles: TilesRenderer }> = ({ tiles }) => {
  const [attributions, setAttributions] = useState(() =>
    tiles.getAttributions()
  )
  useEffect(() => {
    let queued = false
    const callback = (): void => {
      if (!queued) {
        queued = true
        queueMicrotask(() => {
          setAttributions(tiles.getAttributions())
          queued = false
        })
      }
    }
    tiles.addEventListener('tile-visibility-change', callback)
    tiles.addEventListener('load-tile-set', callback)
    return () => {
      tiles.removeEventListener('tile-visibility-change', callback)
      tiles.removeEventListener('load-tile-set', callback)
    }
  }, [tiles])

  return (
    attributions.length > 0 && (
      <Attribution>
        Tiles:{' '}
        {attributions
          .filter(({ type }) => type === 'string')
          .map(({ value }) => value)}
      </Attribution>
    )
  )
}

export const Description: FC<{ children?: ReactNode }> = ({ children }) => {
  const gl = useThree(({ gl }) => gl)
  const target = gl.domElement.parentNode

  const element = useMemo(() => document.createElement('div'), [])
  const root = useRef<Root>(null)
  useLayoutEffect(() => {
    const currentRoot = createRoot(element)
    root.current = currentRoot
    target?.appendChild(element)
    return () => {
      target?.removeChild(element)
      currentRoot.unmount()
    }
  }, [target, element])

  const tiles = useAtomValue(tilesAtom)

  useLayoutEffect(() => {
    root.current?.render(
      <DescriptionElement>
        {children}
        {tiles != null && <TilesAttribution tiles={tiles} />}
      </DescriptionElement>
    )
  })

  return null
}
