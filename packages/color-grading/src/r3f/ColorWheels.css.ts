import { style } from '@vanilla-extract/css'

export const root = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, min-content)',
  gridTemplateRows: '1fr',
  gridColumnGap: '16px',
  justifyContent: 'space-evenly',
  padding: '8px 16px',
  backgroundColor: '#222'
})
