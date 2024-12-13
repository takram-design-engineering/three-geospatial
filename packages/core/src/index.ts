/// <reference types="vite-plugin-glsl/ext" />

import depth from './shaders/depth.glsl'
import packing from './shaders/packing.glsl'
import transform from './shaders/transform.glsl'

export const depthShader: string = depth
export const packingShader: string = packing
export const transformShader: string = transform

export * from './ArrayBufferLoader'
export * from './assertions'
export * from './bufferGeometry'
export * from './DataLoader'
export * from './Ellipsoid'
export * from './EllipsoidGeometry'
export * from './Geodetic'
export * from './math'
export * from './PointOfView'
export * from './Rectangle'
export * from './TileCoordinate'
export * from './TilingScheme'
export * from './typedArray'
export * from './TypedArrayLoader'
export * from './types'
