import { style } from '@vanilla-extract/css'

export const root = /*#__PURE__*/ style({
  overflow: 'auto', // TODO: Overlay
  height: '100%',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  rowGap: '1px',
  columnGap: '1px',
  backgroundColor: '#333'
})
