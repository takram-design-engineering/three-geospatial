declare module 'three/examples/jsm/lights/LightProbeGenerator' {
  import {
    type LightProbe,
    type CubeTexture,
    type WebGLRenderTarget,
    type WebGLRenderer
  } from 'three'

  export const LightProbeGenerator: {
    fromCubeTexture: (cubeTexture: CubeTexture) => LightProbe
    fromCubeRenderTarget: (
      renderer: WebGLRenderer,
      cubeTexture: WebGLRenderTarget
    ) => Promise<LightProbe>
  }
}
