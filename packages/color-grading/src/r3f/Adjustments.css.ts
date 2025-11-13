import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  display: 'grid',
  gridTemplateColumns: 'min-content 40px 1fr min-content',
  alignItems: 'center',
  alignContent: 'center',
  columnGap: '8px',
  rowGap: '16px',
  padding: '8px 16px',
  backgroundColor: '#222'
})
