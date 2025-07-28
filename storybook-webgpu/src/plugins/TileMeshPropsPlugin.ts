import { applyProps, type ElementProps } from '@react-three/fiber'
import type { TilesRenderer, TilesRendererEventMap } from '3d-tiles-renderer'
import { Mesh } from 'three'

export class TileMeshPropsPlugin {
  readonly props: ElementProps<typeof Mesh>
  tiles?: TilesRenderer

  constructor(options?: ElementProps<typeof Mesh>) {
    this.props = { ...options }
  }

  private readonly handleTileVisibilityChange = ({
    scene,
    visible
  }: TilesRendererEventMap['tile-visibility-change']): void => {
    if (visible) {
      scene.traverse(object => {
        if (object instanceof Mesh) {
          // @ts-expect-error This should work.
          applyProps(object, this.props)
        }
      })
    }
  }

  // Plugin method
  init(tiles: TilesRenderer): void {
    this.tiles = tiles
    tiles.group.traverse(object => {
      if (object instanceof Mesh) {
        // @ts-expect-error This should work.
        applyProps(object, this.props)
      }
    })
    tiles.addEventListener(
      'tile-visibility-change',
      this.handleTileVisibilityChange
    )
  }

  // Plugin method
  dispose(): void {
    this.tiles?.removeEventListener(
      'tile-visibility-change',
      this.handleTileVisibilityChange
    )
  }
}
