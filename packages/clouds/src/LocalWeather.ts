import { RenderTexture } from './RenderTexture'

import fragmentShader from './shaders/localWeather.frag?raw'

export class LocalWeather extends RenderTexture {
  constructor() {
    super({
      size: 512,
      fragmentShader
    })
  }
}
