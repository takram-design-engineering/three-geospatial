/// <reference types="vite-plugin-glsl/ext" />

import packing from './shaders/packing.glsl'

export * from './DepthEffect'
export * from './DitheringEffect'
export * from './GeometryPass'
export * from './LensFlareEffect'
export * from './NormalEffect'
export * from './setupMaterialsForGeometryPass'
export * from './SSREffect'

export const shaders = { packing }
