import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  overflow: 'hidden',
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'min-content 1fr',
  rowGap: '1px',
  columnGap: '1px',
  backgroundColor: '#333'
})

export const head = /*#__PURE__*/ style({
  overflow: 'auto', // TODO: Overlay
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-evenly',
  gap: '16px',
  padding: '8px 16px',
  backgroundColor: '#222'
})

export const body = /*#__PURE__*/ style({
  overflow: 'auto', // TODO: Overlay
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  columnGap: '1px'
})
