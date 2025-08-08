import { create } from 'storybook/theming'

const base = create()

export default create({
  base: 'dark',
  brandTitle: '@takram/three-geospatial Experimental WebGPU support',
  brandUrl: 'https://github.com/takram-design-engineering/three-geospatial/',
  fontCode: `Consolas, ${base.fontCode}`
})
