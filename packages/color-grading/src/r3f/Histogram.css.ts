import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  display: 'grid',
  padding: '16px',
  paddingTop: '24px',
  userSelect: 'none'
})

export const content = /*#__PURE__*/ style({
  position: 'relative',
  minWidth: '200px',
  minHeight: '100px'
})

export const canvas = /*#__PURE__*/ style({
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  imageRendering: 'pixelated',
  mixBlendMode: 'screen'
})

export const svg = /*#__PURE__*/ style({
  overflow: 'visible',
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  fontSize: '10px',
  fontVariantNumeric: 'tabular-nums'
})
