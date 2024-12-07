/// <reference types="vite-plugin-glsl/ext" />

import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'

export const functionsShader: string = functions
export const parametersShader: string = parameters

export * from './AerialPerspectiveEffect'
export * from './AtmosphereEffectBase'
export * from './AtmosphereMaterialBase'
export * from './AtmosphereParameters'
export * from './blackBodyChromaticity'
export * from './celestialDirections'
export * from './constants'
export * from './getSunLightColor'
export * from './PrecomputedTexturesLoader'
export * from './SkyLightProbe'
export * from './SkyMaterial'
export * from './StarsGeometry'
export * from './StarsMaterial'
export * from './SunDirectionalLight'
