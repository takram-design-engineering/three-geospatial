import { SRGBColorSpace, TextureLoader } from 'three'
import { screenSize, screenUV, select, texture, uniform, vec2 } from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { useResource } from '../../helpers/useResource'

export function useFilterTextureNode(): TextureNode {
  const [textureNode] = useResource(() => {
    const image = new TextureLoader().load('public/seaside.webp', texture => {
      imageAspect.value = texture.width / texture.height
    })
    image.colorSpace = SRGBColorSpace
    image.flipY = false

    const imageAspect = uniform(1)
    const screenAspect = screenSize.x.div(screenSize.y)
    const scale = select(
      imageAspect.greaterThan(screenAspect),
      vec2(screenAspect.div(imageAspect), 1),
      vec2(1, imageAspect.div(screenAspect))
    )
    const uvNode = screenUV.sub(0.5).mul(scale).add(0.5)

    const textureNode = texture(image)
    textureNode.uvNode = uvNode
    return [textureNode, image]
  }, [])

  return textureNode
}
