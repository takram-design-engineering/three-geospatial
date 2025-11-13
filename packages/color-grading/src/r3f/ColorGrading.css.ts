import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  height: '100%',
  display: 'grid',
  gridTemplateColumns: '1fr repeat(2, 2fr)',
  rowGap: '1px',
  columnGap: '1px',
  backgroundColor: '#333'
})
