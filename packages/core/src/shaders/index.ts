/// <reference types="vite-plugin-glsl/ext" />

import _depth from './depth.glsl'
import _generators from './generators.glsl'
import _math from './math.glsl'
import _packing from './packing.glsl'
import _transform from './transform.glsl'

export const depth: string = _depth
export const generators: string = _generators
export const math: string = _math
export const packing: string = _packing
export const transform: string = _transform
