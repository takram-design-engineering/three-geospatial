import { globalStyle, style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  display: 'inline-grid',
  gridTemplateColumns: 'min-content min-content',
  alignItems: 'center',
  columnGap: '8px'
})

export const body = /*#__PURE__*/ style({
  display: 'inline-grid',
  gridTemplateColumns: 'min-content 48px',
  alignItems: 'center',
  columnGap: '8px',
  cursor: 'ew-resize'
})

export const label = /*#__PURE__*/ style({
  userSelect: 'none'
})

export const input = /*#__PURE__*/ style({
  width: '100%',
  ':focus': {
    cursor: 'auto'
  }
})

export const reset = /*#__PURE__*/ style({})

globalStyle(`${body} > *`, {
  cursor: 'inherit'
})
