import { style } from '@vanilla-extract/css'

import { chromaGradient } from './utils'

export const strokeWidth = 6

export const root = /*#__PURE__*/ style({
  display: 'grid',
  justifyItems: 'center',
  padding: '16px',
  paddingTop: '8px',
  userSelect: 'none'
})

export const content = /*#__PURE__*/ style({
  position: 'relative',
  aspectRatio: '1',
  minHeight: '100px',
  maxHeight: '100%'
})

export const canvas = /*#__PURE__*/ style({
  position: 'absolute',
  top: `${strokeWidth / 2}px`,
  left: `${strokeWidth / 2}px`,
  width: `calc(100% - ${strokeWidth}px)`,
  height: `calc(100% - ${strokeWidth}px)`,
  imageRendering: 'pixelated',
  mixBlendMode: 'screen'
})

export const svg = /*#__PURE__*/ style({
  position: 'absolute',
  top: `${strokeWidth / 2}px`,
  left: `${strokeWidth / 2}px`,
  width: `calc(100% - ${strokeWidth}px)`,
  height: `calc(100% - ${strokeWidth}px)`,
  fontSize: '10px'
})

export const gradient = /*#__PURE__*/ style({
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  background: `conic-gradient(${chromaGradient()})`,
  borderRadius: '50%'
})
