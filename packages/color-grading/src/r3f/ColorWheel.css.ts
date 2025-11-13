import { style } from '@vanilla-extract/css'

import { chromaGradient } from './utils'

import { inputLabel as inputLabelBase } from './elements.css'

export const strokeWidth = 6

export const root = /*#__PURE__*/ style({
  position: 'relative',
  display: 'grid',
  gridTemplateRows: 'auto auto auto',
  rowGap: '8px',
  alignSelf: 'center',
  justifyItems: 'center'
})

export const head = /*#__PURE__*/ style({
  display: 'grid',
  gridTemplateColumns: '16px auto 16px',
  gridTemplateAreas: '"top-left name top-right"',
  justifyItems: 'center',
  width: '100%',
  height: '16px'
})

export const name = /*#__PURE__*/ style([
  inputLabelBase,
  {
    gridArea: 'name'
  }
])

export const topRight = /*#__PURE__*/ style({
  gridArea: 'top-right'
})

export const wheel = /*#__PURE__*/ style({
  position: 'relative',
  userSelect: 'none',
  margin: '8px'
})

export const gradient = /*#__PURE__*/ style({
  position: 'absolute',
  width: '100%',
  height: '100%',
  background: `conic-gradient(${chromaGradient()})`,
  borderRadius: '50%'
})

export const trackball = /*#__PURE__*/ style({
  position: 'absolute',
  top: `${strokeWidth / 2}px`,
  left: `${strokeWidth / 2}px`,
  width: `calc(100% - ${strokeWidth}px)`,
  height: `calc(100% - ${strokeWidth}px)`,
  background:
    'radial-gradient(#333 0%, color-mix(in srgb, #111 75%, transparent) 100%)',
  borderRadius: '50%'
})

export const svg = /*#__PURE__*/ style({
  overflow: 'visible',
  position: 'absolute',
  width: '100%',
  height: '100%'
})

export const values = /*#__PURE__*/ style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  columnGap: '4px',
  rowGap: '2px'
})

export const inputLabel = /*#__PURE__*/ style([
  inputLabelBase,
  {
    color: '#999',
    fontSize: '10px',
    textAlign: 'center'
  }
])
