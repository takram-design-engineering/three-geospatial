import { KawaseBlurMaterial } from 'postprocessing'

export class CloudsShadowBlurMaterial extends KawaseBlurMaterial {
  constructor(...args: ConstructorParameters<typeof KawaseBlurMaterial>) {
    super(...args)

    this.vertexShader = /* glsl */ `
      uniform vec4 texelSize; // XY = texel size, ZW = half texel size
      uniform float kernel;
      uniform float scale;

      varying vec2 vUv;
      varying vec2 vUv0;
      varying vec2 vUv1;
      varying vec2 vUv2;
      varying vec2 vUv3;

      void main() {
        vec2 uv = position.xy * 0.5 + 0.5;
        vec2 dUv = (texelSize.xy * vec2(kernel) + texelSize.zw) * scale;

        vUv = uv;
        vUv0 = vec2(uv.x - dUv.x, uv.y + dUv.y);
        vUv1 = vec2(uv.x + dUv.x, uv.y + dUv.y);
        vUv2 = vec2(uv.x + dUv.x, uv.y - dUv.y);
        vUv3 = vec2(uv.x - dUv.x, uv.y - dUv.y);

        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `

    this.fragmentShader = /* glsl */ `
      #ifdef FRAMEBUFFER_PRECISION_HIGH
      uniform mediump sampler2D inputBuffer;
      #else
      uniform lowp sampler2D inputBuffer;
      #endif // FRAMEBUFFER_PRECISION_HIGH

      varying vec2 vUv;
      varying vec2 vUv0;
      varying vec2 vUv1;
      varying vec2 vUv2;
      varying vec2 vUv3;

      void main() {
        vec4 center = texture2D(inputBuffer, vUv);
        vec4 sum = texture2D(inputBuffer, vUv0); // Top left
        sum += texture2D(inputBuffer, vUv1); // Top right
        sum += texture2D(inputBuffer, vUv2); // Bottom right
        sum += texture2D(inputBuffer, vUv3); // Bottom left
        gl_FragColor = vec4(center.r, sum.gba * 0.25);

        #include <colorspace_fragment>
      }
    `
  }
}
