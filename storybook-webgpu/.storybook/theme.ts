import { create, themes } from 'storybook/theming'

export const main = create({
  base: 'dark',
  brandTitle: '@takram/three-geospatial/webgpu',
  brandUrl: 'https://github.com/takram-design-engineering/three-geospatial',
  fontCode: `Consolas, ${themes.normal.fontCode}`
})

export const docs = create({
  base: 'light',
  fontBase: `Inter, ${themes.normal.fontBase}`,
  fontCode: `Consolas, ${themes.normal.fontCode}`
})
