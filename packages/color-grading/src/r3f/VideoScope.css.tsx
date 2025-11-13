import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  display: 'grid',
  gridTemplateRows: 'min-content 1fr',
  color: '#ccc',
  backgroundColor: 'black'
})

export const head = /*#__PURE__*/ style({
  margin: '8px',
  marginBottom: '0',
  color: '#ccc',
  fontSize: '11px',
  lineHeight: '16px',
  letterSpacing: '0.03em'
})

export const mode = /*#__PURE__*/ style({
  color: '#666',
  marginLeft: '0.5em'
})
